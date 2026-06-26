# AI Evaluator

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/aievaluator.aievaluator?label=Marketplace&color=6A5ACD)](https://marketplace.visualstudio.com/items?itemName=aievaluator.aievaluator)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**Evaluate your AI agents from VS Code.** Catch regressions before they reach production. No signup. No API key. Just select text, pick metrics, and run.

---

## Quick Start

1. Type a prompt in any file: `What is the capital of France?`
2. Select the text, right-click → **AI Evaluator: Evaluate from editor**
3. Pick an agent and metrics → **Run**

Result appears inline. 5 evaluations per day on the free tier.

---

## Installation

Search **"AI Evaluator"** in Extensions (`Ctrl+Shift+X`), or run:

```bash
code --install-extension aievaluator.aievaluator
```

---

## Features

### Quality Gates per Metric

Set different thresholds for each metric. The evaluation fails if any metric drops below its bar — perfect for CI/CD pipelines:

```
g_eval          0.70
faithfulness    0.90  ← hallucinations are instant fails
bias            0.80
```

### Custom Evaluators

Define your own evaluation criteria from the Command Palette:

```
AI Evaluator: Add Custom Evaluator
  Name:       politeness
  Prompt:     Is the response polite and professional?
  Threshold:  0.85
```

Custom evaluators appear alongside built-in metrics. Session-scoped.

### Dataset Evaluation

Right-click any `.json` or `.jsonl` file → **Evaluate this dataset**. Code Lens available above files in `evals/` directories. Results open as formatted JSON.

### CI/CD Snippets

Command Palette → **AI Evaluator: Generate CI/CD Snippet** → pick your dataset → ready-to-use GitHub Actions, GitLab CI, or Jenkins workflow.

### Evaluation History

Activity bar icon opens a sidebar with your last 20 evaluations — scores, timestamps, pass/fail. Re-run or clear from the sidebar.

---

## Metrics

| Metric | What it measures |
|---|---|
| `g_eval` | General LLM-as-a-Judge quality |
| `faithfulness` | Factual accuracy vs context (RAG) |
| `hallucination` | Fabricated information detection |
| `bias` | Output fairness and neutrality |
| `answer_relevancy` | How well the answer addresses the query |

Metrics marked with a key icon require an API key (free — 100 evaluations/month at [aievaluator.dev/settings](https://aievaluator.dev/settings)).

---

## Commands

| Command | Description |
|---|---|
| `AI Evaluator: Evaluate from editor` | Evaluate selected text, or current file if it's a dataset |
| `AI Evaluator: Set API Key` | Unlock advanced metrics |
| `AI Evaluator: Add Custom Evaluator` | Define your own evaluation criteria |
| `AI Evaluator: Generate CI/CD Snippet` | Create a CI/CD workflow for your dataset |
| `AI Evaluator: Initialize Eval Project` | Scaffold `evals/` folder with sample dataset |

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `aievaluator.defaultAgent` | Internal | Your agent's endpoint URL |
| `aievaluator.defaultMetrics` | `g_eval` | Comma-separated list of metrics |
| `aievaluator.engineUrl` | `https://api.aievaluator.dev` | Engine API URL |

---

## FAQ

**Is it free?** Yes. 5 evaluations/day via playground. 100/month with a free API key.

**What agents are supported?** Any HTTP endpoint. OpenAI-compatible, Claude, custom APIs.

**Does it require signup?** No. The playground works without authentication.

**Privacy?** Your prompts and responses are sent to `api.aievaluator.dev` for evaluation only. See our [privacy policy](https://aievaluator.dev/privacy).

---

## Development

```bash
git clone https://github.com/aievaluator-dev/aievaluator-cli.git
cd aievaluator-cli/vscode
npm ci
npm run compile
# Press F5 to launch the Extension Development Host
```

---

## License

MIT © [AI Evaluator](https://aievaluator.dev)
