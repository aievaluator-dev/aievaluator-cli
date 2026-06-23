import * as vscode from 'vscode';
import * as https from 'https';

const ENGINE_URL = 'https://api.aievaluator.dev';

export function activate(context: vscode.ExtensionContext) {
  console.log('AI Evaluator extension activated');

  // Register sidebar
  const provider = new SidebarProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('aievaluator.sidebar', provider)
  );

  // Quick eval from selection
  context.subscriptions.push(
    vscode.commands.registerCommand('aievaluator.evaluateSelection', async () => {
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

      // Single-screen: expected output + metrics in one QuickPick
      const metricItems: vscode.QuickPickItem[] = [
        { label: 'g_eval', description: 'General LLM-as-a-Judge evaluation', picked: true },
        { label: 'faithfulness', description: 'Factual accuracy vs context (RAG)', picked: false },
        { label: 'hallucination', description: 'Detects fabricated information', picked: false },
        { label: 'bias', description: 'Identifies biased outputs', picked: false },
        { label: 'answer_relevancy', description: 'How well the answer addresses the query', picked: false },
      ];

      const quickPick = vscode.window.createQuickPick();
      quickPick.title = `Evaluate: "${selection.substring(0, 60)}${selection.length > 60 ? '...' : ''}"`;
      quickPick.placeholder = 'Expected output (optional) — then select metrics and press Enter';
      quickPick.items = metricItems;
      quickPick.canSelectMany = true;
      quickPick.selectedItems = metricItems.filter((m) => m.picked);
      quickPick.buttons = [
        { iconPath: new vscode.ThemeIcon('play'), tooltip: 'Run Evaluation' },
      ];

      const result = await new Promise<{ expected: string; metrics: string[] } | undefined>((resolve) => {
        quickPick.onDidAccept(() => {
          const picked = quickPick.selectedItems as vscode.QuickPickItem[];
          const metrics = picked.length > 0 ? picked.map((m) => m.label) : ['g_eval'];
          resolve({ expected: quickPick.value, metrics });
          quickPick.hide();
        });
        quickPick.onDidTriggerButton(() => {
          const picked = quickPick.selectedItems as vscode.QuickPickItem[];
          const metrics = picked.length > 0 ? picked.map((m) => m.label) : ['g_eval'];
          resolve({ expected: quickPick.value, metrics });
          quickPick.hide();
        });
        quickPick.onDidHide(() => {
          resolve(undefined);
          quickPick.dispose();
        });
        quickPick.show();
      });

      if (!result) return; // user cancelled

      const expected = result.expected;
      const metrics = result.metrics;

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Evaluating...' },
        async () => {
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

            const data = JSON.parse(result) as {
              results: Array<{ query: string; scores: Record<string, number>; passed: boolean }>;
              overall_score: number;
              playground: boolean;
            };

            const evalResult = data.results?.[0];
            if (evalResult) {
              const scores = evalResult.scores || {};
              const scoreList = Object.entries(scores)
                .map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`)
                .join(' · ');
              const passIcon = evalResult.passed ? '✅' : '❌';
              vscode.window.showInformationMessage(
                `AI Evaluator: ${scoreList} ${passIcon}`,
              );
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            if (msg.includes('429')) {
              vscode.window.showWarningMessage('AI Evaluator: Daily limit reached. Sign up for 100 free evals/month.');
            } else {
              vscode.window.showErrorMessage(`AI Evaluator: ${msg}`);
            }
          }
        }
      );
    })
  );

  // Set API key
  context.subscriptions.push(
    vscode.commands.registerCommand('aievaluator.setAPIKey', async () => {
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
    })
  );

  // Generate CI/CD snippet
  context.subscriptions.push(
    vscode.commands.registerCommand('aievaluator.generateCISnippet', async () => {
      const dataset = await vscode.window.showInputBox({
        prompt: 'Path to your dataset file',
        placeHolder: './evals/regression.json',
        value: './evals/regression.json',
      });

      if (!dataset) return;

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
    })
  );
}

class SidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
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

  private _getHtml(): string {
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

export function deactivate() {}

// ── Helpers ──────────────────────────────────────────────────────────

function httpRequest(url: string, options: { method: string; headers: Record<string, string>; body?: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: options.method,
        headers: {
          ...options.headers,
          'Content-Length': Buffer.byteLength(options.body || ''),
        },
        rejectUnauthorized: false, // allow self-signed certs in dev
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
          } else {
            resolve(data);
          }
        });
      },
    );
    req.on('error', (e) => reject(e));
    if (options.body) req.write(options.body);
    req.end();
  });
}
