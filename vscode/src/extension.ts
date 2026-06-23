import * as vscode from 'vscode';
import * as https from 'https';

const ENGINE_URL = 'https://api.aievaluator.dev';
const ALL_METRICS = [
  { label: 'g_eval', description: 'General LLM-as-a-Judge evaluation', picked: true },
  { label: 'faithfulness', description: 'Factual accuracy vs context (RAG)', picked: false },
  { label: 'hallucination', description: 'Detects fabricated information', picked: false },
  { label: 'bias', description: 'Identifies biased outputs', picked: false },
  { label: 'answer_relevancy', description: 'How well the answer addresses the query', picked: false },
];

class EvalHistoryItem {
  constructor(
    public query: string,
    public scores: Record<string, number>,
    public passed: boolean,
    public timestamp: Date,
    public evaluationId: string,
  ) {}
}

let history: EvalHistoryItem[] = [];
let sidebarProvider: SidebarProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
  // Load history from workspace state
  history = (context.workspaceState.get<EvalHistoryItem[]>('aievaluator.history') || []);

  // Sidebar
  sidebarProvider = new SidebarProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('aievaluator.sidebar', sidebarProvider)
  );

  // Code lens on datasets
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'json', pattern: '**/evals/**/*.json' },
      new EvalCodeLensProvider()
    )
  );
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'jsonc', pattern: '**/evals/**/*.json' },
      new EvalCodeLensProvider()
    )
  );

  // Evaluate from editor context menu
  context.subscriptions.push(
    vscode.commands.registerCommand('aievaluator.evaluateFromEditor', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      // Check if it's a .json file with dataset array
      if (editor.document.fileName.endsWith('.json')) {
        await evaluateDataset(editor.document);
      } else {
        await evaluateSelection();
      }
    })
  );

  // Evaluate selection
  context.subscriptions.push(
    vscode.commands.registerCommand('aievaluator.evaluateSelection', evaluateSelection)
  );

  // Evaluate file
  context.subscriptions.push(
    vscode.commands.registerCommand('aievaluator.evaluateFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) await evaluateDataset(editor.document);
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
        value: './evals/regression.json',
      });
      if (!dataset) return;

      const snippet = generateCISnippet(dataset);
      const doc = await vscode.workspace.openTextDocument({ content: snippet, language: 'yaml' });
      await vscode.window.showTextDocument(doc);
    })
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Quick Pick: expected output + metrics (single screen)
// ═══════════════════════════════════════════════════════════════════

async function pickEvalOptions(query: string): Promise<{ expected: string; metrics: string[]; agent: string; useApiKey: boolean } | undefined> {
  // Step 1: pick agent
  const agentPick = await vscode.window.showQuickPick(
    [
      { label: '🧪 Internal agent', description: 'DeepSeek chat (free, 5/day)', agent: '/chat' },
      { label: '🔗 Custom agent URL', description: 'Your own agent endpoint', agent: '__custom__' },
    ],
    { placeHolder: 'Select agent to evaluate against', title: 'AI Evaluator — Agent' }
  );
  if (!agentPick) return undefined;

  let agent = '/chat';
  if (agentPick.agent === '__custom__') {
    agent = await vscode.window.showInputBox({
      prompt: 'Enter your agent endpoint URL',
      placeHolder: 'https://my-agent.com/chat',
      value: vscode.workspace.getConfiguration('aievaluator').get<string>('defaultAgent') || '',
    }) || '/chat';
  }

  // Step 2: metrics + expected output (single QuickPick)
  const metricItems = ALL_METRICS.map(m => ({ ...m }));

  const quickPick = vscode.window.createQuickPick();
  quickPick.title = `Evaluate: "${query.substring(0, 60)}${query.length > 60 ? '...' : ''}" · Agent: ${agent.substring(0, 30)}`;
  quickPick.placeholder = 'Expected output (optional) — select metrics → Enter';
  quickPick.items = metricItems;
  quickPick.canSelectMany = true;
  quickPick.selectedItems = metricItems.filter(m => m.picked);
  quickPick.buttons = [{ iconPath: new vscode.ThemeIcon('play'), tooltip: 'Run Evaluation' }];

  const result = await new Promise<{ expected: string; metrics: string[] } | undefined>((resolve) => {
    quickPick.onDidAccept(() => {
      const picked = quickPick.selectedItems as vscode.QuickPickItem[];
      const metrics = picked.length > 0 ? picked.map(m => m.label) : ['g_eval'];
      resolve({ expected: quickPick.value, metrics });
      quickPick.hide();
    });
    quickPick.onDidTriggerButton(() => {
      const picked = quickPick.selectedItems as vscode.QuickPickItem[];
      const metrics = picked.length > 0 ? picked.map(m => m.label) : ['g_eval'];
      resolve({ expected: quickPick.value, metrics });
      quickPick.hide();
    });
    quickPick.onDidHide(() => { resolve(undefined); quickPick.dispose(); });
    quickPick.show();
  });

  if (!result) return undefined;

  return {
    expected: result.expected,
    metrics: result.metrics,
    agent,
    useApiKey: agent !== '/chat', // use API key for external agents
  };
}

// ═══════════════════════════════════════════════════════════════════
//  Evaluate selection
// ═══════════════════════════════════════════════════════════════════

async function evaluateSelection() {
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

  const opts = await pickEvalOptions(selection);
  if (!opts) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Evaluating...' },
    async () => {
      try {
        const result = await httpRequest(`${ENGINE_URL}/api/v1/playground/evaluate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rows: [{ input: selection, expected_output: opts.expected || undefined }],
            agent_endpoint: opts.agent,
            metrics: opts.metrics,
          }),
        });

        const data = JSON.parse(result);
        const evalResult = data.results?.[0];
        if (evalResult) {
          const scores = evalResult.scores || {};
          const scoreList = Object.entries(scores as Record<string, number>)
            .map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`)
            .join(' · ');
          const passIcon = evalResult.passed ? '✅' : '❌';

          addToHistory(selection, scores as Record<string, number>, evalResult.passed, data.evaluation_id || '');
          sidebarProvider?.refresh(history);

          vscode.window.showInformationMessage(`AI Evaluator: ${scoreList} ${passIcon}`);
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
}

// ═══════════════════════════════════════════════════════════════════
//  Evaluate dataset file
// ═══════════════════════════════════════════════════════════════════

async function evaluateDataset(document: vscode.TextDocument) {
  const text = document.getText();
  let rows: object[];
  try { rows = JSON.parse(text); } catch {
    vscode.window.showErrorMessage('AI Evaluator: Invalid JSON in file');
    return;
  }
  if (!Array.isArray(rows)) rows = [rows];

  const count = rows.length;
  const proceed = await vscode.window.showInformationMessage(
    `Evaluate ${count} quer${count === 1 ? 'y' : 'ies'} from ${document.fileName.split('/').pop()}?`,
    { modal: false },
    'Evaluate',
  );
  if (proceed !== 'Evaluate') return;

  const opts = await pickEvalOptions(`Dataset: ${count} rows`);
  if (!opts) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Evaluating ${count} queries...` },
    async () => {
      try {
        const result = await httpRequest(`${ENGINE_URL}/api/v1/playground/evaluate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rows,
            agent_endpoint: opts.agent,
            metrics: opts.metrics,
          }),
        });

        const data = JSON.parse(result);
        const score = data.overall_score || 0;
        const passIcon = (data.results || []).every((r: { passed: boolean }) => r.passed) ? '✅' : '❌';

        // Show output in a new editor
        const output = JSON.stringify(data, null, 2);
        const outDoc = await vscode.workspace.openTextDocument({
          content: output,
          language: 'json',
        });
        await vscode.window.showTextDocument(outDoc, { preview: false });

        vscode.window.showInformationMessage(
          `AI Evaluator: ${(score * 100).toFixed(0)}% overall · ${count} rows ${passIcon}`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        vscode.window.showErrorMessage(`AI Evaluator: ${msg}`);
      }
    }
  );
}

// ═══════════════════════════════════════════════════════════════════
//  History
// ═══════════════════════════════════════════════════════════════════

function addToHistory(query: string, scores: Record<string, number>, passed: boolean, id: string) {
  history.unshift(new EvalHistoryItem(query, scores, passed, new Date(), id));
  if (history.length > 20) history = history.slice(0, 20);
  // persist across sessions
  const ctx = vscode.extensions.getExtension('aievaluator.aievaluator');
  ctx?.exports?.context?.workspaceState?.update('aievaluator.history', history);
}

// ═══════════════════════════════════════════════════════════════════
//  Sidebar
// ═══════════════════════════════════════════════════════════════════

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
        case 'setApiKey':
          await vscode.commands.executeCommand('aievaluator.setAPIKey');
          break;
        case 'clearHistory':
          history = [];
          this._context.workspaceState.update('aievaluator.history', history);
          this.refresh(history);
          break;
      }
    });

    this.refresh(history);
  }

  refresh(hist: EvalHistoryItem[]) {
    if (this._view) {
      this._view.webview.html = this._getHtml(hist);
    }
  }

  private _getHtml(hist: EvalHistoryItem[]): string {
    const historyHtml = hist.length === 0
      ? '<p style="color:var(--vscode-descriptionForeground);font-size:12px;">No evaluations yet. Select text and run a quick evaluation.</p>'
      : hist.slice(0, 10).map(h => {
          const time = h.timestamp.toLocaleTimeString();
          const icon = h.passed ? '✅' : '❌';
          const scores = Object.entries(h.scores)
            .map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`)
            .join(' · ');
          const query = h.query.length > 60 ? h.query.substring(0, 60) + '...' : h.query;
          return `<div style="margin:6px 0;padding:6px;background:var(--vscode-textBlockQuote-background);border-radius:4px;font-size:12px;">
            <div style="font-weight:bold">${icon} ${scores}</div>
            <div style="color:var(--vscode-descriptionForeground);margin-top:2px">${escapeHtml(query)}</div>
            <div style="color:var(--vscode-descriptionForeground);font-size:10px;margin-top:2px">${time}</div>
          </div>`;
        }).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { padding: 10px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); }
    button { width: 100%; padding: 7px; margin: 4px 0; background: var(--vscode-button-background);
             color: var(--vscode-button-foreground); border: none; cursor: pointer; border-radius: 3px; font-size: 12px; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    h3 { margin: 0 0 8px 0; font-size: 14px; }
    .hint { font-size: 11px; color: var(--vscode-descriptionForeground); margin: 8px 0; }
  </style>
</head>
<body>
  <h3>🧪 AI Evaluator</h3>
  <button onclick="runEval()">▶ Run Quick Evaluation</button>
  <button onclick="setKey()" class="secondary">🔑 Set API Key</button>
  <button onclick="openDashboard()" class="secondary">📊 Open Dashboard</button>
  <div class="hint">Select text in the editor, then click Run.</div>
  <hr style="border:0;border-top:1px solid var(--vscode-widget-border);margin:10px 0">
  <div style="display:flex;justify-content:space-between;align-items:center">
    <span style="font-weight:bold;font-size:12px">Recent</span>
    ${hist.length > 0 ? '<button onclick="clearHistory()" style="width:auto;padding:2px 8px;font-size:10px" class="secondary">Clear</button>' : ''}
  </div>
  ${historyHtml}
  <script>
    const vscode = acquireVsCodeApi();
    function runEval() { vscode.postMessage({ command: 'evaluate' }); }
    function setKey() { vscode.postMessage({ command: 'setApiKey' }); }
    function openDashboard() { vscode.postMessage({ command: 'openDashboard' }); }
    function clearHistory() { vscode.postMessage({ command: 'clearHistory' }); }
  </script>
</body>
</html>`;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  Code Lens on dataset files
// ═══════════════════════════════════════════════════════════════════

class EvalCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const topLine = document.lineAt(0);
    const range = new vscode.Range(0, 0, 0, topLine.text.length);
    return [
      new vscode.CodeLens(range, {
        title: '🧪 Evaluate this dataset',
        command: 'aievaluator.evaluateFile',
      }),
    ];
  }
}

// ═══════════════════════════════════════════════════════════════════
//  CI/CD snippet
// ═══════════════════════════════════════════════════════════════════

function generateCISnippet(dataset: string): string {
  return `# GitHub Actions — AI Quality Gate
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
}

// ═══════════════════════════════════════════════════════════════════
//  HTTP helper
// ═══════════════════════════════════════════════════════════════════

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
        rejectUnauthorized: false,
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function deactivate() {}
