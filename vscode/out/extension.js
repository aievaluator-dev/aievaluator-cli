"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const https = __importStar(require("https"));
const ENGINE_URL = 'https://api.aievaluator.dev';
function activate(context) {
    console.log('AI Evaluator extension activated');
    // Register sidebar
    const provider = new SidebarProvider(context.extensionUri, context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('aievaluator.sidebar', provider));
    // Quick eval from selection
    context.subscriptions.push(vscode.commands.registerCommand('aievaluator.evaluateSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('AI Evaluator: No active editor');
            return;
        }
        const selection = editor.document.getText(editor.selection);
        if (!selection) {
            vscode.window.showWarningMessage('AI Evaluator: Select text to evaluate');
            return;
        }
        // Prompt for expected output
        const expected = await vscode.window.showInputBox({
            prompt: 'Expected output (optional)',
            placeHolder: 'The expected response from your agent',
        });
        // Pick metrics
        const metricItems = [
            { label: 'g_eval', description: 'General LLM-as-a-Judge evaluation', picked: true },
            { label: 'faithfulness', description: 'Factual accuracy vs context (RAG)', picked: false },
            { label: 'hallucination', description: 'Detects fabricated information', picked: false },
            { label: 'bias', description: 'Identifies biased outputs', picked: false },
            { label: 'answer_relevancy', description: 'How well the answer addresses the query', picked: false },
        ];
        const picked = await vscode.window.showQuickPick(metricItems, {
            canPickMany: true,
            placeHolder: 'Select metrics (g_eval is default)',
            title: 'AI Evaluator — Choose Metrics',
        });
        const metrics = (picked && picked.length > 0)
            ? picked.map((m) => m.label)
            : ['g_eval'];
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Evaluating...' }, async () => {
            try {
                const result = await httpRequest(`${ENGINE_URL}/api/v1/playground/evaluate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        rows: [{ input: selection, expected_output: expected || undefined }],
                        agent_endpoint: '/chat',
                        metrics,
                    }),
                });
                const data = JSON.parse(result);
                const evalResult = data.results?.[0];
                if (evalResult) {
                    const scores = evalResult.scores || {};
                    const scoreList = Object.entries(scores)
                        .map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`)
                        .join(' · ');
                    const passIcon = evalResult.passed ? '✅' : '❌';
                    vscode.window.showInformationMessage(`AI Evaluator: ${scoreList} ${passIcon}`);
                }
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : 'Unknown error';
                if (msg.includes('429')) {
                    vscode.window.showWarningMessage('AI Evaluator: Daily limit reached. Sign up for 100 free evals/month.');
                }
                else {
                    vscode.window.showErrorMessage(`AI Evaluator: ${msg}`);
                }
            }
        });
    }));
    // Set API key
    context.subscriptions.push(vscode.commands.registerCommand('aievaluator.setAPIKey', async () => {
        const key = await vscode.window.showInputBox({
            prompt: 'Enter your AI Evaluator API key',
            placeHolder: 'sk-...',
            password: true,
            ignoreFocusOut: true,
        });
        if (key) {
            await context.secrets.store('aievaluator.apiKey', key);
            vscode.window.showInformationMessage('AI Evaluator: API key saved');
        }
    }));
    // Generate CI/CD snippet
    context.subscriptions.push(vscode.commands.registerCommand('aievaluator.generateCISnippet', async () => {
        const dataset = await vscode.window.showInputBox({
            prompt: 'Path to your dataset file',
            placeHolder: './evals/regression.json',
            value: './evals/regression.json',
        });
        if (!dataset)
            return;
        const snippet = `# GitHub Actions — AI Quality Gate
name: AI Quality Gate
on: [pull_request]

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install aievaluator
      - run: |
          aievaluator eval \\
            --agent \${{ vars.STAGING_AGENT_URL }} \\
            --dataset ${dataset} \\
            --metrics faithfulness,g_eval \\
            --min-score 0.80 \\
            --ci \\
            --format junit > report.xml
        env:
          AIEVALUATOR_API_KEY: \${{ secrets.AI_EVALUATOR_API_KEY }}
      - name: Deploy
        if: success()
        run: ./deploy.sh`;
        const doc = await vscode.workspace.openTextDocument({
            content: snippet,
            language: 'yaml',
        });
        await vscode.window.showTextDocument(doc);
    }));
}
class SidebarProvider {
    _extensionUri;
    _context;
    _view;
    constructor(_extensionUri, _context) {
        this._extensionUri = _extensionUri;
        this._context = _context;
    }
    resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.command) {
                case 'evaluate':
                    await vscode.commands.executeCommand('aievaluator.evaluateSelection');
                    break;
                case 'openDashboard':
                    vscode.env.openExternal(vscode.Uri.parse('https://www.aievaluator.dev'));
                    break;
            }
        });
        webviewView.webview.html = this._getHtml();
    }
    _getHtml() {
        return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { padding: 12px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); }
    button { width: 100%; padding: 8px; margin: 6px 0; background: var(--vscode-button-background);
             color: var(--vscode-button-foreground); border: none; cursor: pointer; border-radius: 3px; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    h3 { margin-top: 0; }
    .hint { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 12px; }
  </style>
</head>
<body>
  <h3>🧪 AI Evaluator</h3>
  <p>Evaluate your prompts and agents from VS Code.</p>
  <button onclick="runEval()">Run Quick Evaluation</button>
  <button onclick="openDashboard()">Open Dashboard</button>
  <p class="hint">Select text in the editor, then run a quick evaluation.</p>
  <script>
    const vscode = acquireVsCodeApi();
    function runEval() { vscode.postMessage({ command: 'evaluate' }); }
    function openDashboard() { vscode.postMessage({ command: 'openDashboard' }); }
  </script>
</body>
</html>`;
    }
}
function deactivate() { }
// ── Helpers ──────────────────────────────────────────────────────────
function httpRequest(url, options) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const req = https.request({
            hostname: parsed.hostname,
            port: parsed.port || 443,
            path: parsed.pathname + parsed.search,
            method: options.method,
            headers: {
                ...options.headers,
                'Content-Length': Buffer.byteLength(options.body || ''),
            },
            rejectUnauthorized: false, // allow self-signed certs in dev
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
                }
                else {
                    resolve(data);
                }
            });
        });
        req.on('error', (e) => reject(e));
        if (options.body)
            req.write(options.body);
        req.end();
    });
}
//# sourceMappingURL=extension.js.map