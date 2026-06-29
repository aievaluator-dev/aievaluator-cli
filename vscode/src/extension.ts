import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

const ENGINE_URL = 'https://api.aievaluator.dev';
const ALL_METRICS = [
  { id: 'g_eval', label: 'g_eval', description: 'General LLM-as-a-Judge evaluation', picked: true, threshold: 0.7 },
  { id: 'faithfulness', label: 'faithfulness', description: 'Factual accuracy vs context (RAG)', picked: false, threshold: 0.7 },
];

// These require API key (eval endpoint, not playground)
const PRO_METRICS = [
  { id: 'hallucination', label: 'hallucination', description: 'Detects fabricated information', picked: false, threshold: 0.8 },
  { id: 'bias', label: 'bias', description: 'Identifies biased outputs', picked: false, threshold: 0.8 },
  { id: 'answer_relevancy', label: 'answer_relevancy', description: 'How well the answer addresses the query', picked: false, threshold: 0.7 },
];

interface CustomEvalDef { name: string; prompt: string; threshold: number; }
let inlineCustomEvaluators: CustomEvalDef[] = [];

class EvalHistoryItem {
  constructor(
    public query: string,
    public scores: Record<string, number>,
    public passed: boolean,
    public timestamp: Date,
    public evaluationId: string,
    public response?: string,
    public expected?: string,
  ) {}
}

let history: EvalHistoryItem[] = [];
let sidebarProvider: SidebarProvider | undefined;
let extContext: vscode.ExtensionContext | undefined;

export function activate(context: vscode.ExtensionContext) {
  extContext = context;
  history = (context.workspaceState.get<EvalHistoryItem[]>('aievaluator.history') || []);
  inlineCustomEvaluators = (context.workspaceState.get<CustomEvalDef[]>('aievaluator.customEvaluators') || []);

  sidebarProvider = new SidebarProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('aievaluator.sidebar', sidebarProvider)
  );

  const codeLensPattern = '**/evals/**/*.{json,jsonl}';
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ language: 'json', pattern: codeLensPattern }, new EvalCodeLensProvider())
  );
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ language: 'jsonc', pattern: codeLensPattern }, new EvalCodeLensProvider())
  );
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ language: 'jsonl', pattern: codeLensPattern }, new EvalCodeLensProvider())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aievaluator.evaluateFromEditor', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const name = editor.document.fileName;
      if (name.endsWith('.json') || name.endsWith('.jsonl')) {
        await evaluateDataset(editor.document);
      } else {
        await evaluateSelection();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aievaluator.evaluateSelection', evaluateSelection)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aievaluator.evaluateFile', async () => {
      // Find all dataset files in workspace
      const datasets = findDatasetFiles();
      if (datasets.length === 0) {
        vscode.window.showWarningMessage('AI Evaluator: No .json or .jsonl files found. Run Init to create examples.');
        return;
      }
      // Show QuickPick with all dataset files
      const pick = await vscode.window.showQuickPick(
        datasets.map(d => ({
          label: d.name,
          description: d.folder,
          detail: d.path,
        })),
        { placeHolder: 'Select a dataset to evaluate', title: 'AI Evaluator — Datasets' }
      );
      if (pick) {
        const fileDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(pick.detail));
        await evaluateDataset(fileDoc);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aievaluator.setAPIKey', async () => {
      const key = await vscode.window.showInputBox({
        prompt: 'Enter your AI Evaluator API key (from aievaluator.dev)',
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

  context.subscriptions.push(
    vscode.commands.registerCommand('aievaluator.addCustomEvaluator', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Custom evaluator name (used as metric reference)',
        placeHolder: 'politeness',
      });
      if (!name) return;

      // Webview panel with textarea + optional save-to-file
      const result = await showCustomEvalPromptPanel(name);
      if (!result) return;

      // Save prompt to file if requested
      if (result.saveToFile && result.fileName) {
        const folders = vscode.workspace.workspaceFolders;
        if (folders) {
          const filePath = path.join(folders[0].uri.fsPath, 'evals', result.fileName);
          const evalsDir = path.dirname(filePath);
          if (!fs.existsSync(evalsDir)) fs.mkdirSync(evalsDir, { recursive: true });
          fs.writeFileSync(filePath, `# ${name}\n# Custom evaluator prompt\n\n${result.prompt}\n`, 'utf-8');
        }
      }

      const thresholdStr = await vscode.window.showInputBox({
        prompt: 'Threshold (0.0-1.0)',
        placeHolder: '0.8',
        value: '0.8',
      });
      if (!thresholdStr || isNaN(parseFloat(thresholdStr))) return;
      const threshold = parseFloat(thresholdStr);

      inlineCustomEvaluators.push({ name: name, prompt: result.prompt, threshold });
      context.workspaceState.update('aievaluator.customEvaluators', inlineCustomEvaluators);
      vscode.window.showInformationMessage(
        `AI Evaluator: Custom evaluator "${name}" added.`,
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aievaluator.generateCISnippet', async (platformArg?: string) => {
      let platform = platformArg;
      if (!platform) {
        const pick = await vscode.window.showQuickPick(
          [
            { label: '🐙 GitHub Actions', description: '.github/workflows/ai-eval.yml', platform: 'github' },
            { label: '🦊 GitLab CI', description: '.gitlab-ci.yml', platform: 'gitlab' },
          ],
          { placeHolder: 'Select CI/CD platform', title: 'AI Evaluator — Generate CI/CD Snippet' }
        );
        if (!pick) return;
        platform = pick.platform;
      }

      const dataset = await vscode.window.showInputBox({
        prompt: 'Path to your dataset file',
        value: './evals/regression.json',
      });
      if (!dataset) return;

      const snippet = platform === 'gitlab'
        ? generateGitLabCISnippet(dataset)
        : generateCISnippet(dataset);
      const doc = await vscode.workspace.openTextDocument({ content: snippet, language: 'yaml' });
      await vscode.window.showTextDocument(doc);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aievaluator.init', async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders) { vscode.window.showWarningMessage('AI Evaluator: Open a workspace folder first'); return; }
      const cwd = folders[0].uri.fsPath;
      const configPath = path.join(cwd, 'aievaluator.config.json');
      if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify({
          engine_url: 'https://api.aievaluator.dev',
          default_metrics: 'faithfulness,g_eval',
          default_min_score: 0.80,
        }, null, 2) + '\n');
      }
      const evalsDir = path.join(cwd, 'evals');
      if (!fs.existsSync(evalsDir)) fs.mkdirSync(evalsDir);
      const smokePath = path.join(evalsDir, 'smoke-test.json');
      const orderQuestions = [
        { input: 'What is the status of my order #ORD-2026-4831?', expected_output: 'It is in transit and will arrive in 3-5 business days.' },
        { input: 'How can I cancel my subscription?', expected_output: 'You can cancel within 30 days by emailing support.' },
        { input: 'What payment methods do you accept?', expected_output: 'Credit card, debit card, PayPal, and bank transfer.' },
        { input: 'I did not receive my refund, how long does it take?', expected_output: 'Refunds are processed in 5-10 business days.' },
        { input: 'How do I add an additional user to my account?', expected_output: 'Go to Settings > Team > Add member.' },
      ];
      if (!fs.existsSync(smokePath)) {
        fs.writeFileSync(smokePath, JSON.stringify(orderQuestions, null, 2) + '\n');
      }
      const smokeJsonlPath = path.join(evalsDir, 'smoke-test.jsonl');
      if (!fs.existsSync(smokeJsonlPath)) {
        fs.writeFileSync(smokeJsonlPath, orderQuestions.map(r => JSON.stringify(r)).join('\n') + '\n');
      }
      // RAG dataset with context field
      const ragPath = path.join(evalsDir, 'smoke-test-rag.json');
      // Results output directory
      const resultsDir = path.join(cwd, 'results');
      if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir);
      if (!fs.existsSync(ragPath)) {
        const ragQuestions = [
          {
            input: 'Can I cancel my order?',
            expected_output: 'Yes, you can cancel within 30 days of purchase by emailing support@example.com.',
            context: 'Cancellation policy: customers can cancel their order within 30 days of purchase. They must email support@example.com with their order number. Refunds are processed in 5-10 business days.'
          },
          {
            input: 'How long does premium shipping take?',
            expected_output: 'Premium shipping takes 1-2 business days.',
            context: 'Shipping options: standard (5-7 business days, free), express (3-5 business days, $9.99), premium (1-2 business days, $19.99). All shipments include a tracking number.'
          },
          {
            input: 'How do I reset my password?',
            expected_output: 'Go to the login page and click "Forgot my password". You will receive a reset link by email.',
            context: 'Password reset: users can reset their password from the login page by clicking "Forgot my password". They will receive a reset link at their registered email. The link expires in 1 hour. If they do not receive the email, they should contact support.'
          },
        ];
        fs.writeFileSync(ragPath, JSON.stringify(ragQuestions, null, 2) + '\n');
      }
      const gitignorePath = path.join(cwd, '.gitignore');
      const entry = 'aievaluator.config.json';
      const lines = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8').split('\n') : [];
      if (!lines.includes(entry)) {
        const content = (lines.length > 0 && lines[lines.length - 1].trim() !== '' ? '\n' : '') + entry + '\n';
        fs.appendFileSync(gitignorePath, content);
      }
      vscode.window.showInformationMessage('AI Evaluator: Project initialized!', 'Open smoke-test.json').then(action => {
        if (action === 'Open smoke-test.json') {
          vscode.workspace.openTextDocument(smokePath).then(doc => vscode.window.showTextDocument(doc));
        }
      });
    })
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Custom evaluator prompt panel (textarea + save-to-file option)
// ═══════════════════════════════════════════════════════════════════

async function showCustomEvalPromptPanel(name: string): Promise<{ prompt: string; saveToFile: boolean; fileName?: string } | undefined> {
  const panel = vscode.window.createWebviewPanel(
    'customEvalPrompt',
    `Custom Evaluator: ${name}`,
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{padding:20px;font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-foreground);background:var(--vscode-editor-background)}
  h3{margin-bottom:8px;font-size:14px}
  .hint{font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:12px}
  textarea{width:100%;height:200px;padding:10px;font-family:var(--vscode-editor-font-family);font-size:13px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:3px;resize:vertical;line-height:1.5}
  textarea:focus{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
  label.check{display:flex;align-items:center;gap:6px;margin:12px 0 6px;font-size:12px;cursor:pointer}
  input[type="checkbox"]{accent-color:var(--vscode-focusBorder)}
  input[type="text"]{width:100%;padding:6px 10px;font-size:12px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:3px}
  input[type="text"]:focus{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
  .save-row{margin-bottom:16px}
  .actions{display:flex;gap:8px;margin-top:16px}
  button{padding:8px 20px;border:none;border-radius:3px;cursor:pointer;font-size:13px;font-weight:500}
  button.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground);flex:1}
  button.primary:hover{background:var(--vscode-button-hoverBackground)}
  button.cancel{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
  button.cancel:hover{background:var(--vscode-button-secondaryHoverBackground)}
</style>
</head>
<body>
  <h3>Evaluation Prompt</h3>
  <p class="hint">Describe what the judge should evaluate. Be specific — this prompt is sent to the LLM judge.</p>
  <textarea id="prompt" placeholder="Is the response polite and professional? Answer YES/NO and explain why."></textarea>

  <label class="check">
    <input type="checkbox" id="saveCb" onchange="toggleSave()">
    <span>Save prompt as file</span>
  </label>
  <div class="save-row" id="saveRow" style="display:none">
    <input type="text" id="fileName" value="${escapeHtml(name)}-custom_eval.md" placeholder="filename.md">
    <span class="hint" style="display:block;margin-top:4px">Saved to evals/ folder in workspace.</span>
  </div>

  <div class="actions">
    <button class="primary" onclick="submit()">✓ Save Evaluator</button>
    <button class="cancel" onclick="cancel()">Cancel</button>
  </div>

  <script>
    const v = acquireVsCodeApi();
    function toggleSave() {
      document.getElementById('saveRow').style.display = document.getElementById('saveCb').checked ? 'block' : 'none';
    }
    function submit() {
      const prompt = document.getElementById('prompt').value.trim();
      if (!prompt) return;
      const saveToFile = document.getElementById('saveCb').checked;
      const fileName = saveToFile ? document.getElementById('fileName').value.trim() : undefined;
      v.postMessage({ command: 'submit', prompt, saveToFile, fileName });
    }
    function cancel() { v.postMessage({ command: 'cancel' }); }
  </script>
</body>
</html>`;

  return new Promise((resolve) => {
    panel.webview.onDidReceiveMessage((msg) => {
      if (msg.command === 'submit') {
        resolve({ prompt: msg.prompt, saveToFile: msg.saveToFile, fileName: msg.fileName || undefined });
        panel.dispose();
      } else if (msg.command === 'cancel') {
        resolve(undefined);
        panel.dispose();
      }
    });
    panel.onDidDispose(() => resolve(undefined));
  });
}

// ═══════════════════════════════════════════════════════════════════
//  3-step flow: agent → metrics → thresholds form (webview)
// ═══════════════════════════════════════════════════════════════════

async function pickEvalOptions(query: string, hasApiKey: boolean): Promise<{
  expected: string;
  metrics: { name: string; threshold: number }[];
  agent: string;
  useApiKey: boolean;
} | undefined> {
  // ── Step 1: pick agent ──
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
      validateInput: (value) => {
        if (!value) return 'URL is required';
        if (value.includes('localhost') || value.includes('127.0.0.1') || value.includes('0.0.0.0')) {
          return '⚠ Local URLs are not reachable from the cloud engine. Use a public URL or tunnel (e.g. ngrok).';
        }
        return null;
      },
    }) || '/chat';
  }

  // ── Step 2: pick metrics (PRO_METRICS when API key is set) ──
  const availableMetrics = hasApiKey ? [...ALL_METRICS, ...PRO_METRICS] : ALL_METRICS;
  const metricItems: (vscode.QuickPickItem & { metricId: string; defaultThreshold: number })[] = [
    ...availableMetrics.map(m => ({
      label: m.label,
      description: m.description,
      picked: m.picked,
      metricId: m.id,
      defaultThreshold: m.threshold,
    })),
    ...(hasApiKey ? inlineCustomEvaluators.map(ce => ({
      label: `🔧 ${ce.name}`,
      description: ce.prompt.substring(0, 60),
      picked: false,
      metricId: ce.name,
      defaultThreshold: ce.threshold,
    })) : []),
  ];

  const qp = vscode.window.createQuickPick();
  qp.title = `Evaluate: "${query.substring(0, 60)}${query.length > 60 ? '...' : ''}" · Agent: ${agent.substring(0, 25)}`;
  qp.placeholder = 'Check the metrics you want to use';
  qp.items = metricItems;
  qp.canSelectMany = true;
  qp.selectedItems = metricItems.filter(m => m.picked);

  const pickedMetrics = await new Promise<typeof metricItems | undefined>((resolve) => {
    qp.onDidAccept(() => {
      const sel = qp.selectedItems as typeof metricItems;
      resolve(sel.length > 0 ? [...sel] : undefined);
      qp.hide();
    });
    qp.onDidHide(() => { resolve(undefined); qp.dispose(); });
    qp.show();
  });

  if (!pickedMetrics) return undefined;

  // ── Step 3: threshold form (webview with text fields per metric) ──
  const result = await showThresholdForm(query, pickedMetrics);
  if (!result) return undefined;

  return { ...result, agent, useApiKey: agent !== '/chat' };
}

async function showThresholdForm(
  query: string,
  metrics: { metricId: string; defaultThreshold: number; label: string; description?: string }[]
): Promise<{ expected: string; metrics: { name: string; threshold: number }[] } | undefined> {
  const panel = vscode.window.createWebviewPanel(
    'aievaluatorThresholds',
    'AI Evaluator — Thresholds',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  const rowsHtml = metrics.map((m, i) => `
    <tr>
      <td style="padding:6px 12px;font-weight:500;white-space:nowrap">${escapeHtml(m.label)}</td>
      <td style="padding:6px 12px;color:var(--vscode-descriptionForeground);font-size:12px;max-width:300px">${escapeHtml(m.description || '')}</td>
      <td style="padding:6px 12px">
        <input type="number" id="th_${i}" value="${m.defaultThreshold}"
               min="0" max="1" step="0.05"
               style="width:80px;padding:4px 8px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:3px;font-size:13px" />
      </td>
    </tr>`).join('');

  panel.webview.html = `<!DOCTYPE html>
<html>
<head>
  <style>
    * { box-sizing:border-box; margin:0; padding:0 }
    body { padding:20px; font-family:var(--vscode-font-family); color:var(--vscode-foreground); background:var(--vscode-editor-background) }
    h2 { font-size:16px; margin-bottom:12px }
    .hint { font-size:12px; color:var(--vscode-descriptionForeground); margin-bottom:16px }
    table { width:100%; border-collapse:collapse; margin-bottom:16px }
    th { text-align:left; padding:6px 12px; font-size:11px; text-transform:uppercase; color:var(--vscode-descriptionForeground); border-bottom:1px solid var(--vscode-panel-border) }
    td { border-bottom:1px solid var(--vscode-panel-border) }
    .expected-row { margin-bottom:20px }
    .expected-row label { display:block; font-size:13px; font-weight:500; margin-bottom:4px }
    .expected-row input { width:100%; padding:6px 10px; background:var(--vscode-input-background); color:var(--vscode-input-foreground); border:1px solid var(--vscode-input-border); border-radius:3px; font-size:13px }
    button { padding:8px 20px; background:var(--vscode-button-background); color:var(--vscode-button-foreground); border:none; border-radius:3px; cursor:pointer; font-size:13px; font-weight:500 }
    button:hover { background:var(--vscode-button-hoverBackground) }
    .actions { display:flex; gap:8px; margin-top:16px; align-items:center }
    .actions .cancel { background:var(--vscode-button-secondaryBackground); color:var(--vscode-button-secondaryForeground) }
    .actions .cancel:hover { background:var(--vscode-button-secondaryHoverBackground) }
    input[type=number]:focus { outline:1px solid var(--vscode-focusBorder); outline-offset:-1px }
  </style>
</head>
<body>
  <h2>⚙️ Thresholds</h2>
  <p class="hint">Set the minimum score for each metric (0.0–1.0). The evaluation fails if any metric drops below its threshold.</p>

  <div style="margin-bottom:16px;padding:10px;background:var(--vscode-textBlockQuote-background);border-radius:4px">
    <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:4px">Query being evaluated</div>
    <div style="font-size:13px;word-break:break-word">${escapeHtml(query.substring(0, 200))}${query.length > 200 ? '...' : ''}</div>
  </div>

  <div class="expected-row">
    <label for="expected">Expected output (optional)</label>
    <input type="text" id="expected" placeholder="What should the agent respond?" />
  </div>

  <table>
    <thead><tr><th>Metric</th><th>Description</th><th>Threshold</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="actions">
    <button onclick="submit()" style="flex:1">▶ Run Evaluation</button>
    <button class="cancel" onclick="cancel()">Cancel</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const metricIds = ${JSON.stringify(metrics.map(m => m.metricId))};
    const defaultThresholds = ${JSON.stringify(metrics.map(m => m.defaultThreshold))};
    function submit() {
      const expected = document.getElementById('expected').value.trim();
      const result = [];
      for (let i = 0; i < metricIds.length; i++) {
        const el = document.getElementById('th_' + i);
        result.push({ name: metricIds[i], threshold: el ? (parseFloat(el.value) || defaultThresholds[i]) : defaultThresholds[i] });
      }
      vscode.postMessage({ command: 'submit', expected: expected, metrics: result });
    }
    function cancel() { vscode.postMessage({ command: 'cancel' }); }
  </script>
</body>
</html>`;

  return new Promise((resolve) => {
    panel.webview.onDidReceiveMessage((msg) => {
      // Resolve BEFORE dispose — otherwise onDidDispose wins the race
      const result = msg.command === 'submit'
        ? { expected: msg.expected as string, metrics: msg.metrics as { name: string; threshold: number }[] }
        : undefined;
      resolve(result);
      panel.dispose();
    });
    panel.onDidDispose(() => resolve(undefined));
  });
}

// ═══════════════════════════════════════════════════════════════════
//  Evaluate selection
// ═══════════════════════════════════════════════════════════════════

async function evaluateSelection() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { vscode.window.showWarningMessage('AI Evaluator: No active editor'); return; }

  const selection = editor.document.getText(editor.selection);
  if (!selection) { vscode.window.showWarningMessage('AI Evaluator: Select text to evaluate'); return; }

  // Check for API key → enables PRO metrics + eval endpoint
  const apiKey: string | undefined = await extContext?.secrets.get('aievaluator.apiKey');

  const opts = await pickEvalOptions(selection, !!apiKey);
  if (!opts) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Evaluating...' },
    async () => {
      try {
        if (apiKey) {
          // Eval endpoint (API key → all 5 metrics, any agent)
          const body: Record<string, unknown> = {
            rows: [{ input: selection, expected_output: opts.expected || undefined }],
            agent: { url: opts.agent, format: 'openai' },
            metrics: opts.metrics.filter(m => !inlineCustomEvaluators.some(ce => ce.name === m.name)).map(m => m.name),
            thresholds: Object.fromEntries(opts.metrics.map(m => [m.name, m.threshold])),
            custom_evaluators: opts.metrics
              .filter(m => inlineCustomEvaluators.some(ce => ce.name === m.name))
              .map(m => {
                const ce = inlineCustomEvaluators.find(c => c.name === m.name)!;
                return { name: ce.name, prompt: ce.prompt };
              }),
          };
          const data: Record<string, any> = await evaluateAsync(body, apiKey);
          const scores = data.results?.[0]?.scores || {};
          const scoreList = Object.entries(scores as Record<string, number>)
            .map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`)
            .join(' · ');
          const passIcon = data.results?.[0]?.passed ? '✅' : '❌';
          addToHistory(selection, scores as Record<string, number>, data.results?.[0]?.passed, data.evaluation_id || '', data.results?.[0]?.agent_response, opts.expected);
          sidebarProvider?.refresh(history);
          vscode.window.showInformationMessage(`AI Evaluator: ${scoreList} ${passIcon}`);
        } else {
          // Playground endpoint (no API key or internal agent)
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
            addToHistory(selection, scores as Record<string, number>, evalResult.passed, data.evaluation_id || '', evalResult.agent_response, opts.expected);
            sidebarProvider?.refresh(history);
            vscode.window.showInformationMessage(`AI Evaluator: ${scoreList} ${passIcon}`);
          }
        }
      } catch (e) {
        const msg = formatApiError(e);
        if (msg.toLowerCase().includes('daily limit') || msg.toLowerCase().includes('429')) {
          vscode.window.showWarningMessage(`AI Evaluator: ${msg}`, 'Get API Key').then(action => {
            if (action === 'Get API Key') vscode.env.openExternal(vscode.Uri.parse('https://www.aievaluator.dev/login'));
          });
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
  let rows: object[];
  try { rows = parseDatasetFile(document.uri.fsPath); } catch {
    vscode.window.showErrorMessage(
      `AI Evaluator: Could not parse ${document.fileName.split('/').pop()}. Make sure it's valid JSON (array of {input, expected_output?}) or JSONL.`,
      'Init example dataset',
    ).then(action => {
      if (action === 'Init example dataset') vscode.commands.executeCommand('aievaluator.init');
    });
    return;
  }

  const count = rows.length;

  const apiKey: string | undefined = await extContext?.secrets.get('aievaluator.apiKey');
  const opts = await pickEvalOptions(`${document.fileName.split('/').pop()}: ${count} quer${count === 1 ? 'y' : 'ies'}`, !!apiKey);
  if (!opts) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Evaluating ${count} queries...` },
    async () => {
      try {
        if (apiKey) {
          const body: Record<string, unknown> = {
            rows,
            agent: { url: opts.agent, format: 'openai' },
            metrics: opts.metrics.filter(m => !inlineCustomEvaluators.some(ce => ce.name === m.name)).map(m => m.name),
            thresholds: Object.fromEntries(opts.metrics.map(m => [m.name, m.threshold])),
            custom_evaluators: opts.metrics
              .filter(m => inlineCustomEvaluators.some(ce => ce.name === m.name))
              .map(m => {
                const ce = inlineCustomEvaluators.find(c => c.name === m.name)!;
                return { name: ce.name, prompt: ce.prompt };
              }),
          };
          const resultData = await evaluateAsync(body, apiKey);
          showResultsPanel(document.fileName.split('/').pop() || 'dataset', resultData);
        } else {
          const result = await httpRequest(`${ENGINE_URL}/api/v1/playground/evaluate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows, agent_endpoint: opts.agent, metrics: opts.metrics }),
          });
          const data = JSON.parse(result);
          showResultsPanel(document.fileName.split('/').pop() || 'dataset', data);
        }
      } catch (e) {
        const msg = formatApiError(e);
        if (msg.toLowerCase().includes('daily limit') || msg.toLowerCase().includes('429')) {
          vscode.window.showWarningMessage(`AI Evaluator: ${msg}`, 'Get API Key').then(action => {
            if (action === 'Get API Key') vscode.env.openExternal(vscode.Uri.parse('https://www.aievaluator.dev/login'));
          });
        } else {
          vscode.window.showErrorMessage(`AI Evaluator: ${msg}`);
        }
      }
    }
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Results panel (dataset evaluation results)
// ═══════════════════════════════════════════════════════════════════

function showResultsPanel(fileName: string, data: Record<string, unknown>) {
  const results = (data.results || []) as Array<Record<string, unknown>>;
  const overallScore = (data.overall_score as number) || 0;
  const allPassed = results.every((r: Record<string, unknown>) => r.passed as boolean);

  // Add to history
  for (const r of results) {
    addToHistory(r.query as string, (r.scores || {}) as Record<string, number>, r.passed as boolean, data.evaluation_id as string || '', r.agent_response as string);
  }
  sidebarProvider?.refresh(history);

  const rowsHtml = results.map((r: Record<string, unknown>, i: number) => {
    const scores = (r.scores || {}) as Record<string, number>;
    const reasons = (r.reasons || {}) as Record<string, string>;
    const response = (r.agent_response as string) || '';
    const scoreList = Object.entries(scores).map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`).join(' · ');
    const metricsHtml = Object.entries(scores).map(([name, score]) => {
      return `<div class="metric-row">
        <div class="metric-header">
          <span class="metric-name">${escapeHtml(name)}</span>
          <span class="metric-score" style="color:${score >= 0.7 ? 'var(--vscode-charts-green)' : 'var(--vscode-charts-red)'}">${(score * 100).toFixed(0)}%</span>
        </div>
        <div class="metric-reason">${escapeHtml(reasons[name] || '\u2014')}</div>
      </div>`;
    }).join('');
    return `<div class="result-item ${r.passed ? 'passed' : 'failed'}" onclick="toggleRow(${i})">
      <div class="result-summary">
        <span class="result-icon">${r.passed ? '\u2705' : '\u274c'}</span>
        <span class="result-query">${escapeHtml(((r.query as string) || '').length > 60 ? (r.query as string).substring(0, 60) + '...' : (r.query as string) || '')}</span>
        <span class="result-score">${scoreList}</span>
      </div>
      <div class="result-detail" id="detail-${i}" style="display:none">
        ${response ? `<div class="detail-section"><div class="detail-label">\u{1F916} Agent Response</div><div class="detail-text">${escapeHtml(response)}</div></div>` : ''}
        <div class="detail-section"><div class="detail-label">\u{1F4CA} Metrics</div>${metricsHtml}</div>
      </div>
    </div>`;
  }).join('');

  const panel = vscode.window.createWebviewPanel(
    'evalResults',
    `Results: ${fileName}`,
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  const now2 = new Date();
  const defaultFileName = `result-${now2.getFullYear()}-${String(now2.getMonth()+1).padStart(2,'0')}-${String(now2.getDate()).padStart(2,'0')}-${String(now2.getHours()).padStart(2,'0')}${String(now2.getMinutes()).padStart(2,'0')}${String(now2.getSeconds()).padStart(2,'0')}.json`;

  panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{padding:16px;font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-foreground);background:var(--vscode-editor-background)}
  .header{margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--vscode-widget-border)}
  .header h2{font-size:16px;margin-bottom:4px}
  .header .overall{font-size:24px;font-weight:700;margin-right:8px}
  .header .overall.pass{color:var(--vscode-charts-green)}
  .header .overall.fail{color:var(--vscode-charts-red)}
  .header .meta{font-size:11px;color:var(--vscode-descriptionForeground)}
  .result-item{margin:2px 0;border-radius:4px;overflow:hidden;cursor:pointer}
  .result-item.failed{border-left:3px solid var(--vscode-charts-red)}
  .result-item.passed{border-left:3px solid var(--vscode-charts-green)}
  .result-summary{padding:8px 10px;display:flex;align-items:center;gap:8px;background:var(--vscode-textBlockQuote-background)}
  .result-summary:hover{background:var(--vscode-list-hoverBackground)}
  .result-icon{font-size:14px;flex-shrink:0}
  .result-query{flex:1;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .result-score{font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap}
  .result-detail{padding:10px;background:var(--vscode-editor-background)}
  .detail-section{margin-bottom:10px}
  .detail-label{font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);margin-bottom:4px;letter-spacing:0.3px}
  .detail-text{font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word;padding:6px 8px;background:var(--vscode-textBlockQuote-background);border-radius:3px}
  .metric-row{margin-bottom:6px}
  .metric-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:2px}
  .metric-name{font-size:12px;font-weight:500}
  .metric-score{font-size:13px;font-weight:700}
  .metric-reason{font-size:11px;color:var(--vscode-descriptionForeground);line-height:1.4;margin-left:4px}
  .actions{display:flex;gap:8px;margin-top:16px}
  button{padding:6px 16px;border:none;border-radius:3px;cursor:pointer;font-size:12px;font-weight:500}
  button.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
  button.primary:hover{background:var(--vscode-button-hoverBackground)}
  button.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
  button.secondary:hover{background:var(--vscode-button-secondaryHoverBackground)}
  label.check{display:flex;align-items:center;gap:6px;margin:12px 0 6px;font-size:12px;cursor:pointer}
  input[type="checkbox"]{accent-color:var(--vscode-focusBorder)}
  input[type="text"]:focus{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}
</style>
</head>
<body>
  <div class="header">
    <h2>\u{1F4CA} ${escapeHtml(fileName)}</h2>
    <div style="display:flex;align-items:baseline;gap:8px">
      <span class="overall ${allPassed ? 'pass' : 'fail'}">${(overallScore * 100).toFixed(0)}%</span>
      <span style="font-size:18px">${allPassed ? '\u2705' : '\u274c'}</span>
    </div>
    <div class="meta">${results.length} quer${results.length === 1 ? 'y' : 'ies'} \u00b7 ${results.filter((r: Record<string, unknown>) => r.passed).length} passed \u00b7 ${results.filter((r: Record<string, unknown>) => !r.passed).length} failed</div>
  </div>

  ${rowsHtml}

  <label class="check">
    <input type="checkbox" id="saveCb" onchange="toggleSave()">
    <span>Save results as file</span>
  </label>
  <div id="saveRow" style="display:none;margin-bottom:12px">
    <input type="text" id="fileName" value="${defaultFileName}" placeholder="result.json" style="width:100%;padding:6px 10px;font-size:12px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:3px">
    <span style="font-size:10px;color:var(--vscode-descriptionForeground);margin-top:3px;display:block">Saved to results/ folder in your workspace.</span>
  </div>

  <div class="actions">
    <button class="primary" id="saveBtn" style="display:none" onclick="saveResult()">💾 Save</button>
    <button class="primary" onclick="dismiss()">\u2713 Dismiss</button>
    <button class="secondary" onclick="expandAll()">Expand All</button>
  </div>

  <script>
    const v = acquireVsCodeApi();
    function toggleRow(i) {
      const el = document.getElementById('detail-' + i);
      if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }
    let allExpanded = false;
    function expandAll() {
      allExpanded = !allExpanded;
      for (let i = 0; i < ${results.length}; i++) {
        const el = document.getElementById('detail-' + i);
        if (el) el.style.display = allExpanded ? 'block' : 'none';
      }
      this.textContent = allExpanded ? 'Collapse All' : 'Expand All';
    }
    function toggleSave() {
      const show = document.getElementById('saveCb').checked;
      document.getElementById('saveRow').style.display = show ? 'block' : 'none';
      document.getElementById('saveBtn').style.display = show ? 'inline-block' : 'none';
    }
    function saveResult() {
      const name = document.getElementById('fileName').value.trim();
      if (!name) return;
      v.postMessage({ command: 'save', fileName: name });
    }
    function dismiss() {
      const save = document.getElementById('saveCb').checked;
      const name = save ? document.getElementById('fileName').value.trim() : '';
      v.postMessage({ command: 'dismiss', save: save, fileName: name });
    }
  </script>
</body>
</html>`;

  panel.webview.onDidReceiveMessage((msg: { command: string; save?: boolean; fileName?: string }) => {
    if (msg.command === 'save' || (msg.command === 'dismiss' && msg.save)) {
      const fname = msg.fileName;
      if (fname) {
        const folders = vscode.workspace.workspaceFolders;
        if (folders) {
          const resultsDir = path.join(folders[0].uri.fsPath, 'results');
          if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
          const filePath = path.join(resultsDir, fname);
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
          vscode.window.showInformationMessage(`Results saved to results/${fname}`);
        }
      }
    }
    if (msg.command === 'dismiss') {
      panel.dispose();
    }
  });
}

function findDatasetFiles(): { name: string; folder: string; path: string }[] {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) return [];
  const results: { name: string; folder: string; path: string }[] = [];
  for (const folder of folders) {
    const evalsDir = path.join(folder.uri.fsPath, 'evals');
    if (fs.existsSync(evalsDir)) {
      const files = fs.readdirSync(evalsDir).filter(f => f.endsWith('.json') || f.endsWith('.jsonl'));
      for (const f of files) {
        results.push({
          name: f,
          folder: 'evals/',
          path: path.join(evalsDir, f),
        });
      }
    }
    // Also check root
    const rootFiles = fs.readdirSync(folder.uri.fsPath).filter(f => f.endsWith('.json') || f.endsWith('.jsonl'));
    for (const f of rootFiles) {
      if (!results.some(r => r.path === path.join(folder.uri.fsPath, f))) {
        results.push({
          name: f,
          folder: './',
          path: path.join(folder.uri.fsPath, f),
        });
      }
    }
  }
  return results;
}

function parseDatasetFile(filePath: string): object[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (filePath.endsWith('.jsonl')) {
    return raw.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
  }
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data : [data];
}

function addToHistory(query: string, scores: Record<string, number>, passed: boolean, id: string, response?: string, expected?: string) {
  history.unshift(new EvalHistoryItem(query, scores, passed, new Date(), id, response, expected));
  if (history.length > 20) history = history.slice(0, 20);
  extContext?.workspaceState.update('aievaluator.history', history);
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
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.command) {
        case 'evaluate': await vscode.commands.executeCommand('aievaluator.evaluateSelection'); break;
        case 'openDashboard': vscode.env.openExternal(vscode.Uri.parse('https://www.aievaluator.dev')); break;
        case 'openDocs': vscode.env.openExternal(vscode.Uri.parse('https://www.aievaluator.dev/tutorials')); break;
        case 'generateWorkflow':
          await vscode.commands.executeCommand('aievaluator.generateCISnippet', msg.index);
          break;
        case 'generateCISnippet': await vscode.commands.executeCommand('aievaluator.generateCISnippet'); break;
        case 'setApiKey': await vscode.commands.executeCommand('aievaluator.setAPIKey'); break;
        case 'initProject': await vscode.commands.executeCommand('aievaluator.init'); break;
        case 'evaluateFile': await vscode.commands.executeCommand('aievaluator.evaluateFile'); break;
        case 'addCustomEval': await vscode.commands.executeCommand('aievaluator.addCustomEvaluator'); this.refresh(history); break;
        case 'deleteCustomEval':
          inlineCustomEvaluators = inlineCustomEvaluators.filter((_, j) => j !== msg.index);
          this._context.workspaceState.update('aievaluator.customEvaluators', inlineCustomEvaluators);
          this.refresh(history);
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
    if (this._view) this._view.webview.html = getSidebarHtml(hist);
  }
}

function getSidebarHtml(hist: EvalHistoryItem[]): string {
  const historyHtml = hist.length === 0
    ? '<p class="hint">No evaluations yet. Run one to see results here.</p>'
    : hist.slice(0, 10).map((h, i) => {
        const scores = Object.entries(h.scores).map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`).join(' · ');
        const hasDetails = !!(h.response || h.expected);
        const detailHtml = hasDetails ? `
          <div class="hist-detail" id="detail-${i}" style="display:none;margin-top:6px;padding-top:6px;border-top:1px solid var(--vscode-widget-border)">
            ${h.response ? `<div class="detail-label">🤖 Response</div><div class="detail-text">${escapeHtml(h.response.length > 300 ? h.response.substring(0, 300) + '...' : h.response)}</div>` : ''}
            ${h.expected ? `<div class="detail-label" style="margin-top:6px">🎯 Expected</div><div class="detail-text">${escapeHtml(h.expected.length > 300 ? h.expected.substring(0, 300) + '...' : h.expected)}</div>` : ''}
          </div>` : '';
        return `<div class="hist-item${hasDetails ? ' clickable' : ''}"${hasDetails ? ` onclick="toggleDetail(${i})"` : ''}>
          <div class="hist-status">${h.passed ? '✅' : '❌'} ${scores}</div>
          <div class="hist-query">${escapeHtml(h.query.length > 50 ? h.query.substring(0, 50) + '...' : h.query)}</div>
          ${detailHtml}
        </div>`;
      }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src 'none'; img-src 'none'; connect-src 'none'; frame-src 'none';">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{padding:8px;font-family:var(--vscode-font-family);font-size:12px;color:var(--vscode-foreground)}
  .section{margin-bottom:12px}
  .section-title{font-size:11px;text-transform:uppercase;color:var(--vscode-descriptionForeground);margin-bottom:6px;letter-spacing:0.5px}
  button{display:block;width:100%;padding:6px 10px;margin:3px 0;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:3px;cursor:pointer;font-size:12px;text-align:left}
  button:hover{background:var(--vscode-button-hoverBackground)}
  button.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
  button.secondary:hover{background:var(--vscode-button-secondaryHoverBackground)}
  .hint{font-size:11px;color:var(--vscode-descriptionForeground);margin:4px 0;line-height:1.4}
  .hist-item{padding:4px 6px;margin:3px 0;background:var(--vscode-textBlockQuote-background);border-radius:3px}
  .hist-item.clickable{cursor:pointer}
  .hist-item.clickable:hover{background:var(--vscode-list-hoverBackground)}
  .hist-status{font-weight:600;font-size:11px}
  .hist-query{color:var(--vscode-descriptionForeground);font-size:10px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .detail-label{font-size:10px;font-weight:600;color:var(--vscode-descriptionForeground);text-transform:uppercase;letter-spacing:0.3px}
  .detail-text{font-size:11px;margin-top:2px;margin-left:4px;padding:4px;background:var(--vscode-editor-background);border-radius:2px;white-space:pre-wrap;word-break:break-word;max-height:150px;overflow-y:auto;line-height:1.4}
  .custom-eval-item{padding:4px 6px;margin:3px 0;background:var(--vscode-textBlockQuote-background);border-radius:3px}
  hr{border:0;border-top:1px solid var(--vscode-widget-border);margin:10px 0}
</style>
</head>
<body>
  <div class="section">
    <div class="section-title">🚀 Setup</div>
    <button onclick="post('initProject')">📁 Init eval project</button>
    <p class="hint">Creates config + example dataset in your workspace.</p>
  </div>

  <div class="section">
    <div class="section-title">📂 Evaluate</div>
    <button onclick="post('evaluate')">▶ Quick eval (selection)</button>
    <button class="secondary" onclick="post('evaluateFile')">📋 Evaluate dataset file…</button>
    <p class="hint">Select text for quick eval, or pick a dataset file.</p>
  </div>

  <div class="section">
    <div class="section-title">🔧 Custom Evaluators</div>
    ${inlineCustomEvaluators.length === 0 ? '<p class="hint">Define your own evaluation criteria.</p>' : inlineCustomEvaluators.map((ce, i) => `
      <div class="custom-eval-item">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:500">${escapeHtml(ce.name)}</span>
          <span style="cursor:pointer;font-size:14px" onclick="post('deleteCustomEval', ${i})" title="Remove">✕</span>
        </div>
        <div style="font-size:10px;color:var(--vscode-descriptionForeground);margin-top:2px">${escapeHtml(ce.prompt.length > 60 ? ce.prompt.substring(0, 60) + '...' : ce.prompt)}</div>
      </div>`).join('')}
    <button class="secondary" onclick="post('addCustomEval')" style="margin-top:4px">+ Add Custom Evaluator</button>
    <p class="hint" style="font-size:10px;margin-top:4px">⚠ Custom evaluators require an API key to run.</p>
  </div>

  <div class="section">
    <div class="section-title">🚀 CI/CD</div>
    <button class="secondary" onclick="post('generateWorkflow', 'github')">🐙 GitHub Actions</button>
    <button class="secondary" onclick="post('generateWorkflow', 'gitlab')">🦊 GitLab CI</button>
    <p class="hint">Generate a quality gate workflow for your pipeline.</p>
  </div>

  <div class="section">
    <div class="section-title">🔑 Settings</div>
    <button class="secondary" onclick="post('setApiKey')">Set API Key</button>
    <button class="secondary" onclick="post('openDashboard')">📊 Open Dashboard</button>
  </div>

  <div class="section">
    <div class="section-title">📖 Docs</div>
    <button class="secondary" onclick="post('openDocs')">Tutorials</button>
  </div>

  <hr>

  <div class="section">
    <div class="section-title">📋 Recent${hist.length > 0 ? ' <span style="cursor:pointer;float:right;font-weight:normal;text-transform:none" onclick="post(\'clearHistory\')">clear</span>' : ''}</div>
    ${historyHtml}
  </div>

  <script>
    const v = acquireVsCodeApi();
    function post(cmd, idx) { v.postMessage({ command: cmd, index: idx }); }
    function toggleDetail(i) {
      const el = document.getElementById('detail-' + i);
      if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }
  </script>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════
//  Code Lens
// ═══════════════════════════════════════════════════════════════════

class EvalCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const topLine = document.lineAt(0);
    const range = new vscode.Range(0, 0, 0, topLine.text.length);
    return [new vscode.CodeLens(range, { title: '🧪 Evaluate this dataset', command: 'aievaluator.evaluateFile' })];
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

function generateGitLabCISnippet(dataset: string): string {
  return `# GitLab CI — AI Quality Gate
ai-quality-gate:
  stage: test
  image: python:3.12
  before_script:
    - pip install aievaluator
  script:
    - |
      aievaluator eval \\
        --agent \${STAGING_AGENT_URL} \\
        --dataset ${dataset} \\
        --metrics faithfulness,g_eval \\
        --min-score 0.80 \\
        --ci \\
        --format junit > report.xml
  artifacts:
    reports:
      junit: report.xml
    when: always
  rules:
    - if: \$CI_PIPELINE_SOURCE == "merge_request_event"`;
}

// ═══════════════════════════════════════════════════════════════════
//  HTTP helper
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
//  HTTP helpers
// ═══════════════════════════════════════════════════════════════════

async function evaluateAsync(body: Record<string, unknown>, apiKey: string): Promise<Record<string, unknown>> {
  const startResult = await httpRequest(`${ENGINE_URL}/api/v1/evaluations/async`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify(body),
  });
  const { definition_id, run_id } = JSON.parse(startResult);

  return vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Evaluating...',
    cancellable: false,
  }, async (progress) => {
    for (let i = 0; i < 60; i++) {
      await sleep(2000);
      const statusResult = await httpRequest(`${ENGINE_URL}/api/v1/evaluations/${definition_id}/status`, {
        method: 'GET',
        headers: { 'X-API-Key': apiKey },
      });
      const status = JSON.parse(statusResult);
      if (status.overall_score !== null && status.overall_score !== undefined) {
        progress.report({ message: `Score: ${(status.overall_score * 100).toFixed(0)}%` });
      }
      if (status.status === 'completed' || status.status === 'failed') {
        const resultsResult = await httpRequest(
          `${ENGINE_URL}/api/v1/evaluations/${definition_id}/results?run_id=${run_id}`,
          { method: 'GET', headers: { 'X-API-Key': apiKey } },
        );
        return JSON.parse(resultsResult);
      }
    }
    throw new Error('Evaluation timed out after 2 minutes');
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpRequest(url: string, options: { method: string; headers: Record<string, string>; body?: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname, port: parsed.port || 443,
      path: parsed.pathname + parsed.search, method: options.method,
      headers: { ...options.headers, 'Content-Length': Buffer.byteLength(options.body || '') },
      rejectUnauthorized: false,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        else resolve(data);
      });
    });
    req.on('error', e => reject(e));
    if (options.body) req.write(options.body);
    req.end();
  });
}

function formatApiError(e: unknown): string {
  const msg = e instanceof Error ? e.message : 'Unknown error';
  // Try to extract JSON from HTTP error body
  const jsonMatch = msg.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const body = JSON.parse(jsonMatch[0]);
      const detail = body.detail;
      if (typeof detail === 'string') return detail;
      if (detail?.error) return detail.error;
      if (detail?.message) return detail.message;
    } catch { /* not JSON, use raw */ }
  }
  // Clean up HTTP prefix
  return msg.replace(/^HTTP \d+: /, '');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function deactivate() {}
