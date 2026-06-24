# AI Evaluator — VS Code Extension

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/aievaluator.aievaluator?label=VS%20Code)](https://marketplace.visualstudio.com/items?itemName=aievaluator.aievaluator)

Evaluate your AI agents without leaving your editor. Select text, pick metrics, set thresholds, run.

---

## 📦 Install

Search **"AI Evaluator"** in VS Code Extensions (`Ctrl+Shift+X`), or:

```bash
code --install-extension aievaluator.aievaluator
```

---

## 🧭 Tutorial — From First Click to Power User

---

### Level 0 — Your first evaluation (10 seconds)

1. Open any file. Type or select: `What is the capital of France?`
2. Right-click → **AI Evaluator: Evaluate from editor**
3. Pick an agent (default: 🧪 Internal agent, free)
4. Check the metrics you want → press **Enter**
5. In the threshold form, click **▶ Run Evaluation**

```
AI Evaluator: g_eval: 92% · faithfulness: 100% ✅
```

> ⚡ 5 free evals/day via playground. No signup. No API key.

---

### Level 1 — Expected output

In the threshold form (step 3), fill the **Expected output** field:

```
Expected output (optional)
┌─────────────────────────────────────────┐
│ Paris                                   │
└─────────────────────────────────────────┘
```

The judge compares the agent's response against your expected output. Leave it empty
for open-ended evaluation.

---

### Level 2 — Per-metric thresholds

Each metric gets its own threshold in the form. Change the values before running:

```
Metric          Description              Threshold
─────────────────────────────────────────────────
g_eval          General LLM-as-a-Judge   [0.7  ]
faithfulness    Factual accuracy...      [0.9  ]
```

The evaluation fails if any metric drops below its threshold. Type directly in the
number fields — they accept values from 0.0 to 1.0 in 0.05 steps.

---

### Level 3 — Scaffold your project

Command Palette (`Ctrl+Shift+P`) → **AI Evaluator: Initialize Eval Project**

Creates `aievaluator.config.json`, `evals/smoke-test.json`, and updates `.gitignore`.

Edit `evals/smoke-test.json` with your test cases, then right-click the file → **Evaluate this dataset**.

---

### Level 4 — Set your API key

For more than 5 evals/day and access to all metrics:

1. Command Palette → **AI Evaluator: Set API Key**
2. Paste your key from [aievaluator.dev/settings](https://aievaluator.dev/settings)

With an API key set and an external agent, the extension switches to the **eval endpoint**:

| Without API Key | With API Key |
|---|---|
| Playground (5/day) | Eval endpoint (100/month free) |
| `g_eval`, `faithfulness` only | All 5 metrics + custom evaluators |
| Internal agent only | Your external agent |

---

### Level 5 — All metrics unlocked

Once your API key is set and you pick an external agent, the metrics list expands:

```
☑ g_eval              General LLM-as-a-Judge evaluation
☑ faithfulness        Factual accuracy vs context (RAG)
☐ hallucination       Detects fabricated information
☐ bias                Identifies biased outputs
☐ answer_relevancy    How well the answer addresses the query
```

Select `hallucination: 0.8` to catch made-up answers, or `bias: 0.8` for fairness checks.

---

### Level 6 — Custom evaluators

Define your own evaluation criteria. Command Palette → **AI Evaluator: Add Custom Evaluator**:

1. **Name:** `politeness`
2. **Prompt:** `Is the response polite and professional? Answer YES or NO.`
3. **Threshold:** `0.85`

Your custom evaluator appears in the metrics list as `🔧 politeness`. Select it, set its
threshold in the form, and run. Add as many as you need — they persist for the session.

---

### Level 7 — Dataset evaluation (JSON + JSONL)

Right-click any `.json` or `.jsonl` file → **Evaluate this dataset**.

A Code Lens appears above dataset files in `evals/`:

```
🧪 Evaluate this dataset    ← click
```

The extension parses `.jsonl` line-by-line and evaluates all queries. Results open
in a new editor tab as formatted JSON.

---

### Level 8 — CI/CD snippet

Command Palette → **AI Evaluator: Generate CI/CD Snippet**

Enter your dataset path → a complete GitHub Actions workflow opens in a new tab.
Copy it to `.github/workflows/ai-quality.yml`.

---

### Level 9 — Sidebar history

Click the 🧪 icon in the activity bar to open the **AI Evaluator sidebar**.

Shows your last 20 evaluations with scores, timestamps, and pass/fail. Use the buttons
to re-run or clear history.

---

## 🎮 Features

| Feature | How |
|---|---|
| Quick eval | Right-click selected text → Evaluate |
| Expected output | Type in the threshold form |
| Per-metric thresholds | Number fields in the threshold form |
| Advanced metrics | Set API key + external agent → hallucination, bias, answer_relevancy |
| Custom evaluators | Command Palette → Add Custom Evaluator |
| Dataset evaluation | Right-click `.json`/`.jsonl` → Evaluate |
| Code Lens | `🧪 Evaluate this dataset` above dataset files |
| Sidebar history | 🧪 icon in activity bar |
| API key | Command Palette → Set API Key (stored in secrets) |
| CI/CD snippet | Command Palette → Generate CI/CD Snippet |
| Project init | Command Palette → Initialize Eval Project |

---

## ⚙️ Workspace Settings

Add to `.vscode/settings.json`:

```json
{
  "aievaluator.defaultAgent": "https://my-agent.com/chat",
  "aievaluator.defaultMetrics": "g_eval",
  "aievaluator.engineUrl": "https://api.aievaluator.dev"
}
```

---

## 🐛 Debug

See [DEBUG.md](./DEBUG.md) to run the extension in development mode.

---

## Requirements

- VS Code 1.85+
