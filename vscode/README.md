# AI Evaluator — VS Code Extension

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/aievaluator.aievaluator?label=VS%20Code&color=6A5ACD)](https://marketplace.visualstudio.com/items?itemName=aievaluator.aievaluator)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/aievaluator.aievaluator?label=Installs&color=success)](https://marketplace.visualstudio.com/items?itemName=aievaluator.aievaluator)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/aievaluator.aievaluator?label=Rating&color=brightgreen)](https://marketplace.visualstudio.com/items?itemName=aievaluator.aievaluator)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**Ship AI agents with confidence.** Evaluate your LLM agents directly from VS Code — catch regressions, set quality gates, and block bad deployments before your users see them.

![AI Evaluator extension in VS Code — evaluate from command palette](images/hero-01-agent-pick.png)

---

## 🤔 Why AI Evaluator?

Writing evals for AI agents is painful: you juggle scripts, dashboards, and CI pipelines. **AI Evaluator brings everything into your editor.**

| Without | With |
|---|---|
| Write ad-hoc scripts in Python | Select text, right-click, done |
| Switch between editor and browser | Stay in VS Code |
| Guess if your agent got better | See scores and pass/fail instantly |
| No CI/CD integration | 1-click GitHub Actions snippet |

---

## ⚡ 60-Second Quickstart

No signup. No API key. Just VS Code.

1. Open any file. Type: `What is the capital of France?`
2. Highlight the text → click **▶ Quick eval** in the sidebar
3. Pick an agent → check metrics → press **▶ Run Evaluation**

```
🧪 AI Evaluator: g_eval: 92% · faithfulness: 100% ✅
```

> ⚡ **5 free evals/day** via playground. 100/month free with API key → [aievaluator.dev](https://www.aievaluator.dev)

---

## 🎯 Features

### Sidebar Panel

Open the **AI Evaluator** icon in the activity bar. The sidebar gives you quick access to everything:

- **📂 Evaluate** — Quick eval from selection, or pick a dataset file to evaluate
- **🔧 Custom Evaluators** — Define your own evaluation criteria with a full text editor
- **🔑 Settings** — Set API Key, open Dashboard
- **📖 Docs** — Quick link to tutorials
- **📋 Recent** — Expandable history showing agent responses, expected output, and per-metric scores

### Dataset Evaluation

Evaluate entire datasets with one click, no JSON blobs in your editor:

1. Click **📋 Evaluate dataset file…** in the sidebar
2. Pick a `.json` (array) or `.jsonl` (newline-delimited) dataset
3. Select agent, metrics, and thresholds
4. Results open in a rich **Results Panel** — not a raw text file

The Results Panel shows:
- Overall score with pass/fail status
- Per-query results: click to expand → agent response + per-metric scores with detailed reasons
- **Save results as file** checkbox → saves to `results/` folder
- **Expand All** / **Collapse All** toggles

### Quick Eval (Selection)

Select any text in the editor, click **▶ Quick eval** in the sidebar. Same flow — agent picker → metrics → thresholds → result. Results appear in the **Recent** sidebar panel with expandable details.

### Per-Metric Quality Gates

Different metrics, different standards. Set individual thresholds for each one:

| Metric | Threshold |
|---|---|
| g_eval | 0.70 |
| faithfulness | 0.90 |
| bias | 0.80 |

The evaluation fails if **any** metric drops below its bar.

---

### Custom Evaluators

Define your own LLM-as-a-Judge criteria right from the sidebar:

1. Click **+ Add Custom Evaluator** in the sidebar
2. Enter a name (e.g. `politeness`)
3. Write your evaluation prompt in a full **textarea** — no cramped single-line inputs
4. Optionally check **Save prompt as file** to persist it to `evals/`

Your custom evaluators persist across VS Code restarts and appear in the metrics picker when evaluating. **Requires an API key** to run (custom prompts are sent to the eval endpoint).

### Init Project

Command Palette → **AI Evaluator: Initialize Eval Project** creates:

| File | Description |
|---|---|
| `evals/smoke-test.json` | 5 example queries for the internal orders agent (JSON array) |
| `evals/smoke-test.jsonl` | Same queries in JSONL format |
| `evals/smoke-test-rag.json` | 3 queries with `context` field for RAG metrics |
| `results/` | Output directory for saved evaluation results |
| `aievaluator.config.json` | Project configuration |

---

### CI/CD Integration

Command Palette → **AI Evaluator: Generate CI/CD Snippet** → picks your dataset → generates a complete GitHub Actions workflow.

```yaml
- run: aievaluator eval --dataset ./evals/regression.json --min-score 0.80 --ci --format junit
```

GitLab CI and Jenkins templates included.

---

### Error Handling

Clear, actionable error messages. The extension parses API errors and shows clean text — not raw JSON:

```
✅ AI Evaluator: Daily limit reached (5/day). Create a free account.  [Get API Key]
```

Localhost agent URLs are blocked with a warning (the cloud engine can't reach `localhost`).

---

### All Metrics

| Metric | What it checks | Requires |
|---|---|---|
| `g_eval` | General LLM-as-a-Judge quality | — |
| `faithfulness` | Factual accuracy vs context (RAG) | API key |
| `hallucination` | Fabricated information detection | API key |
| `bias` | Fairness and neutrality | API key |
| `answer_relevancy` | Does the answer address the query? | API key |
| Custom evaluators | Define your own criteria | API key |

---

## ⌨️ Commands

| Command | When to use |
|---|---|
| **AI Evaluator: Evaluate from editor** | Evaluate selected text or open file |
| **AI Evaluator: Set API Key** | Unlock advanced metrics + 100 evals/month |
| **AI Evaluator: Add Custom Evaluator** | Define your own evaluation criteria |
| **AI Evaluator: Generate CI/CD Snippet** | Get GitHub Actions / GitLab CI / Jenkins workflow |
| **AI Evaluator: Initialize Eval Project** | Create `evals/` + `results/` + sample datasets + config |

---

## ⚙️ Settings

```json
{
  "aievaluator.defaultAgent": "https://my-agent.com/chat",
  "aievaluator.defaultMetrics": "g_eval",
  "aievaluator.engineUrl": "https://api.aievaluator.dev"
}
```

| Setting | Default | Description |
|---|---|---|
| `aievaluator.defaultAgent` | Internal (free) | Your agent's endpoint URL |
| `aievaluator.defaultMetrics` | `g_eval` | Comma-separated metrics |
| `aievaluator.engineUrl` | `https://api.aievaluator.dev` | API endpoint |

---

## ❓ FAQ

**Is it free?**
Yes — 5 evals/day via playground, 100/month free with API key. No credit card required.

**What agents does it support?**
Any agent with an HTTP endpoint. OpenAI-compatible, Claude, custom APIs — if it speaks JSON, it works.

**What metrics are available?**
`g_eval`, `faithfulness`, `hallucination`, `bias`, `answer_relevancy`, plus your own custom evaluators.

**Does it work offline?**
No — evaluations run against the AI Evaluator engine at `api.aievaluator.dev`.

**Can I use it in CI/CD?**
Yes — the **Generate CI/CD Snippet** command gives you a ready-to-use workflow for GitHub Actions, GitLab CI, or Jenkins.

**Is my data safe?**
Your prompts and responses are sent to our engine for evaluation. We don't store them beyond what's needed for the evaluation. See [aievaluator.dev/privacy](https://aievaluator.dev/privacy).

---

## 🛠️ Development

```bash
git clone https://github.com/aievaluator-dev/aievaluator-cli.git
cd aievaluator-cli/vscode
npm ci
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

See [DEBUG.md](./DEBUG.md) for detailed development instructions.

---

## 📄 License

MIT © [AI Evaluator](https://aievaluator.dev)
