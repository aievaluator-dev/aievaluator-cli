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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
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
let inlineCustomEvaluators = [];
class EvalHistoryItem {
    query;
    scores;
    passed;
    timestamp;
    evaluationId;
    constructor(query, scores, passed, timestamp, evaluationId) {
        this.query = query;
        this.scores = scores;
        this.passed = passed;
        this.timestamp = timestamp;
        this.evaluationId = evaluationId;
    }
}
let history = [];
let sidebarProvider;
let extContext;
function activate(context) {
    extContext = context;
    history = (context.workspaceState.get('aievaluator.history') || []);
    sidebarProvider = new SidebarProvider(context.extensionUri, context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('aievaluator.sidebar', sidebarProvider));
    const codeLensPattern = '**/evals/**/*.{json,jsonl}';
    context.subscriptions.push(vscode.languages.registerCodeLensProvider({ language: 'json', pattern: codeLensPattern }, new EvalCodeLensProvider()));
    context.subscriptions.push(vscode.languages.registerCodeLensProvider({ language: 'jsonc', pattern: codeLensPattern }, new EvalCodeLensProvider()));
    context.subscriptions.push(vscode.languages.registerCodeLensProvider({ language: 'jsonl', pattern: codeLensPattern }, new EvalCodeLensProvider()));
    context.subscriptions.push(vscode.commands.registerCommand('aievaluator.evaluateFromEditor', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const name = editor.document.fileName;
        if (name.endsWith('.json') || name.endsWith('.jsonl')) {
            await evaluateDataset(editor.document);
        }
        else {
            await evaluateSelection();
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('aievaluator.evaluateSelection', evaluateSelection));
    context.subscriptions.push(vscode.commands.registerCommand('aievaluator.evaluateFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor)
            await evaluateDataset(editor.document);
    }));
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
    context.subscriptions.push(vscode.commands.registerCommand('aievaluator.addCustomEvaluator', async () => {
        const name = await vscode.window.showInputBox({
            prompt: 'Custom evaluator name (used as metric reference)',
            placeHolder: 'politeness',
        });
        if (!name)
            return;
        const prompt = await vscode.window.showInputBox({
            prompt: 'Evaluation prompt (what should the judge check?)',
            placeHolder: 'Is the response polite and professional? Answer YES/NO.',
        });
        if (!prompt)
            return;
        const thresholdStr = await vscode.window.showInputBox({
            prompt: 'Threshold (0.0-1.0)',
            placeHolder: '0.8',
            value: '0.8',
        });
        if (!thresholdStr || isNaN(parseFloat(thresholdStr)))
            return;
        const threshold = parseFloat(thresholdStr);
        inlineCustomEvaluators.push({ name, prompt, threshold });
        vscode.window.showInformationMessage(`AI Evaluator: Custom evaluator "${name}" added.`);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('aievaluator.generateCISnippet', async () => {
        const dataset = await vscode.window.showInputBox({
            prompt: 'Path to your dataset file',
            value: './evals/regression.json',
        });
        if (!dataset)
            return;
        const snippet = generateCISnippet(dataset);
        const doc = await vscode.workspace.openTextDocument({ content: snippet, language: 'yaml' });
        await vscode.window.showTextDocument(doc);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('aievaluator.init', async () => {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) {
            vscode.window.showWarningMessage('AI Evaluator: Open a workspace folder first');
            return;
        }
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
        if (!fs.existsSync(evalsDir))
            fs.mkdirSync(evalsDir);
        const smokePath = path.join(evalsDir, 'smoke-test.json');
        if (!fs.existsSync(smokePath)) {
            fs.writeFileSync(smokePath, JSON.stringify([
                { input: 'What is 2+2?', expected_output: '4' },
                { input: 'What is the capital of France?', expected_output: 'Paris' },
                { input: 'Say hello in Spanish', expected_output: 'Hola' },
            ], null, 2) + '\n');
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
    }));
}
// ═══════════════════════════════════════════════════════════════════
//  3-step flow: agent → metrics → thresholds form (webview)
// ═══════════════════════════════════════════════════════════════════
async function pickEvalOptions(query, hasApiKey) {
    // ── Step 1: pick agent ──
    const agentPick = await vscode.window.showQuickPick([
        { label: '🧪 Internal agent', description: 'DeepSeek chat (free, 5/day)', agent: '/chat' },
        { label: '🔗 Custom agent URL', description: 'Your own agent endpoint', agent: '__custom__' },
    ], { placeHolder: 'Select agent to evaluate against', title: 'AI Evaluator — Agent' });
    if (!agentPick)
        return undefined;
    let agent = '/chat';
    if (agentPick.agent === '__custom__') {
        agent = await vscode.window.showInputBox({
            prompt: 'Enter your agent endpoint URL',
            placeHolder: 'https://my-agent.com/chat',
            value: vscode.workspace.getConfiguration('aievaluator').get('defaultAgent') || '',
        }) || '/chat';
    }
    // ── Step 2: pick metrics (PRO_METRICS when API key is set) ──
    const availableMetrics = hasApiKey ? [...ALL_METRICS, ...PRO_METRICS] : ALL_METRICS;
    const metricItems = [
        ...availableMetrics.map(m => ({
            label: m.label,
            description: m.description,
            picked: m.picked,
            metricId: m.id,
            defaultThreshold: m.threshold,
        })),
        ...inlineCustomEvaluators.map(ce => ({
            label: `🔧 ${ce.name}`,
            description: ce.prompt.substring(0, 60),
            picked: false,
            metricId: ce.name,
            defaultThreshold: ce.threshold,
        })),
    ];
    const qp = vscode.window.createQuickPick();
    qp.title = `Evaluate: "${query.substring(0, 60)}${query.length > 60 ? '...' : ''}" · Agent: ${agent.substring(0, 25)}`;
    qp.placeholder = 'Check the metrics you want to use';
    qp.items = metricItems;
    qp.canSelectMany = true;
    qp.selectedItems = metricItems.filter(m => m.picked);
    const pickedMetrics = await new Promise((resolve) => {
        qp.onDidAccept(() => {
            const sel = qp.selectedItems;
            resolve(sel.length > 0 ? [...sel] : undefined);
            qp.hide();
        });
        qp.onDidHide(() => { resolve(undefined); qp.dispose(); });
        qp.show();
    });
    if (!pickedMetrics)
        return undefined;
    // ── Step 3: threshold form (webview with text fields per metric) ──
    const result = await showThresholdForm(query, pickedMetrics);
    if (!result)
        return undefined;
    return { ...result, agent, useApiKey: agent !== '/chat' };
}
async function showThresholdForm(query, metrics) {
    const panel = vscode.window.createWebviewPanel('aievaluatorThresholds', 'AI Evaluator — Thresholds', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
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
                ? { expected: msg.expected, metrics: msg.metrics }
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
    if (!editor) {
        vscode.window.showWarningMessage('AI Evaluator: No active editor');
        return;
    }
    const selection = editor.document.getText(editor.selection);
    if (!selection) {
        vscode.window.showWarningMessage('AI Evaluator: Select text to evaluate');
        return;
    }
    // Check for API key → enables PRO metrics + eval endpoint
    const apiKey = await extContext?.secrets.get('aievaluator.apiKey');
    const opts = await pickEvalOptions(selection, !!apiKey);
    if (!opts)
        return;
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Evaluating...' }, async () => {
        try {
            if (apiKey) {
                // Eval endpoint (API key → all 5 metrics, any agent)
                const body = {
                    rows: [{ input: selection, expected_output: opts.expected || undefined }],
                    agent: { url: opts.agent, format: 'openai' },
                    metrics: opts.metrics.map(m => m.name),
                    thresholds: Object.fromEntries(opts.metrics.map(m => [m.name, m.threshold])),
                };
                const result = await httpRequest(`${ENGINE_URL}/api/v1/evaluations/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
                    body: JSON.stringify(body),
                });
                const data = JSON.parse(result);
                const scores = data.results?.[0]?.scores || {};
                const scoreList = Object.entries(scores)
                    .map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`)
                    .join(' · ');
                const passIcon = data.results?.[0]?.passed ? '✅' : '❌';
                addToHistory(selection, scores, data.results?.[0]?.passed, data.evaluation_id || '');
                sidebarProvider?.refresh(history);
                vscode.window.showInformationMessage(`AI Evaluator: ${scoreList} ${passIcon}`);
            }
            else {
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
                    const scoreList = Object.entries(scores)
                        .map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`)
                        .join(' · ');
                    const passIcon = evalResult.passed ? '✅' : '❌';
                    addToHistory(selection, scores, evalResult.passed, data.evaluation_id || '');
                    sidebarProvider?.refresh(history);
                    vscode.window.showInformationMessage(`AI Evaluator: ${scoreList} ${passIcon}`);
                }
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
}
// ═══════════════════════════════════════════════════════════════════
//  Evaluate dataset file
// ═══════════════════════════════════════════════════════════════════
async function evaluateDataset(document) {
    let rows;
    try {
        rows = parseDatasetFile(document.uri.fsPath);
    }
    catch {
        vscode.window.showErrorMessage('AI Evaluator: Invalid JSON/JSONL in file');
        return;
    }
    const count = rows.length;
    const proceed = await vscode.window.showInformationMessage(`Evaluate ${count} quer${count === 1 ? 'y' : 'ies'} from ${document.fileName.split('/').pop()}?`, { modal: false }, 'Evaluate');
    if (proceed !== 'Evaluate')
        return;
    const apiKey = await extContext?.secrets.get('aievaluator.apiKey');
    const opts = await pickEvalOptions(`Dataset: ${count} rows`, !!apiKey);
    if (!opts)
        return;
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Evaluating ${count} queries...` }, async () => {
        try {
            if (apiKey) {
                const body = {
                    rows,
                    agent: { url: opts.agent, format: 'openai' },
                    metrics: opts.metrics.map(m => m.name),
                    thresholds: Object.fromEntries(opts.metrics.map(m => [m.name, m.threshold])),
                };
                const result = await httpRequest(`${ENGINE_URL}/api/v1/evaluations/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
                    body: JSON.stringify(body),
                });
                const data = JSON.parse(result);
                const score = data.overall_score || 0;
                const allPassed = (data.results || []).every((r) => r.passed);
                const output = JSON.stringify(data, null, 2);
                const outDoc = await vscode.workspace.openTextDocument({ content: output, language: 'json' });
                await vscode.window.showTextDocument(outDoc, { preview: false });
                vscode.window.showInformationMessage(`AI Evaluator: ${(score * 100).toFixed(0)}% overall · ${count} rows ${allPassed ? '✅' : '❌'}`);
            }
            else {
                const result = await httpRequest(`${ENGINE_URL}/api/v1/playground/evaluate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rows, agent_endpoint: opts.agent, metrics: opts.metrics }),
                });
                const data = JSON.parse(result);
                const score = data.overall_score || 0;
                const allPassed = (data.results || []).every((r) => r.passed);
                const output = JSON.stringify(data, null, 2);
                const outDoc = await vscode.workspace.openTextDocument({ content: output, language: 'json' });
                await vscode.window.showTextDocument(outDoc, { preview: false });
                vscode.window.showInformationMessage(`AI Evaluator: ${(score * 100).toFixed(0)}% overall · ${count} rows ${allPassed ? '✅' : '❌'}`);
            }
        }
        catch (e) {
            vscode.window.showErrorMessage(`AI Evaluator: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
    });
}
// ═══════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════
function parseDatasetFile(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (filePath.endsWith('.jsonl')) {
        return raw.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
    }
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [data];
}
function addToHistory(query, scores, passed, id) {
    history.unshift(new EvalHistoryItem(query, scores, passed, new Date(), id));
    if (history.length > 20)
        history = history.slice(0, 20);
}
// ═══════════════════════════════════════════════════════════════════
//  Sidebar
// ═══════════════════════════════════════════════════════════════════
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
    refresh(hist) {
        if (this._view)
            this._view.webview.html = getSidebarHtml(hist);
    }
}
function getSidebarHtml(hist) {
    const historyHtml = hist.length === 0
        ? '<p style="color:var(--vscode-descriptionForeground);font-size:12px;">No evaluations yet. Select text and run a quick evaluation.</p>'
        : hist.slice(0, 10).map(h => {
            const scores = Object.entries(h.scores).map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`).join(' · ');
            return `<div style="margin:6px 0;padding:6px;background:var(--vscode-textBlockQuote-background);border-radius:4px;font-size:12px;">
          <div style="font-weight:bold">${h.passed ? '✅' : '❌'} ${scores}</div>
          <div style="color:var(--vscode-descriptionForeground);margin-top:2px">${escapeHtml(h.query.length > 60 ? h.query.substring(0, 60) + '...' : h.query)}</div>
          <div style="color:var(--vscode-descriptionForeground);font-size:10px;margin-top:2px">${h.timestamp.toLocaleTimeString()}</div>
        </div>`;
        }).join('');
    return `<!DOCTYPE html><html><head><style>
    body{padding:10px;font-family:var(--vscode-font-family);color:var(--vscode-foreground)}
    button{width:100%;padding:7px;margin:4px 0;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;cursor:pointer;border-radius:3px;font-size:12px}
    button:hover{background:var(--vscode-button-hoverBackground)}
    button.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
    h3{margin:0 0 8px 0;font-size:14px}
    .hint{font-size:11px;color:var(--vscode-descriptionForeground);margin:8px 0}
  </style></head><body>
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
  <script>const v=acquireVsCodeApi()
  function runEval(){v.postMessage({command:'evaluate'})}
  function setKey(){v.postMessage({command:'setApiKey'})}
  function openDashboard(){v.postMessage({command:'openDashboard'})}
  function clearHistory(){v.postMessage({command:'clearHistory'})}</script>
</body></html>`;
}
// ═══════════════════════════════════════════════════════════════════
//  Code Lens
// ═══════════════════════════════════════════════════════════════════
class EvalCodeLensProvider {
    provideCodeLenses(document) {
        const topLine = document.lineAt(0);
        const range = new vscode.Range(0, 0, 0, topLine.text.length);
        return [new vscode.CodeLens(range, { title: '🧪 Evaluate this dataset', command: 'aievaluator.evaluateFile' })];
    }
}
// ═══════════════════════════════════════════════════════════════════
//  CI/CD snippet
// ═══════════════════════════════════════════════════════════════════
function generateCISnippet(dataset) {
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
function httpRequest(url, options) {
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
                if (res.statusCode && res.statusCode >= 400)
                    reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
                else
                    resolve(data);
            });
        });
        req.on('error', e => reject(e));
        if (options.body)
            req.write(options.body);
        req.end();
    });
}
function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function deactivate() { }
//# sourceMappingURL=extension.js.map