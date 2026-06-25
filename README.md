<!-- omit in toc -->
<p align="center">
  <br>
  <a href="https://aievaluator.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://www.aievaluator.dev/favicon.svg">
      <img alt="AI Evaluator" src="https://www.aievaluator.dev/favicon.svg" width="80">
    </picture>
  </a>
</p>

<h1 align="center">AI Evaluator CLI</h1>

<p align="center">
  <strong>Evaluate your LLM agents from the command line.</strong>
  <br>No browser. No dashboard. Just your terminal and your agent.
</p>

<p align="center">
  <a href="https://pypi.org/project/aievaluator/"><img src="https://img.shields.io/pypi/v/aievaluator?label=PyPI" alt="PyPI"></a>
  <a href="https://www.npmjs.com/package/aievaluator"><img src="https://img.shields.io/npm/v/aievaluator?label=npm" alt="npm"></a>
  <a href="https://www.nuget.org/packages/aievaluator"><img src="https://img.shields.io/nuget/v/aievaluator?label=NuGet" alt="NuGet"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=aievaluator.aievaluator"><img src="https://img.shields.io/visual-studio-marketplace/v/aievaluator.aievaluator?label=VS%20Code" alt="VS Code"></a>
  <a href="https://github.com/aievaluator-dev/aievaluator-cli/actions"><img src="https://github.com/aievaluator-dev/aievaluator-cli/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
</p>

---

## What is AI Evaluator?

**[AI Evaluator](https://aievaluator.dev)** is an LLM-as-a-Judge platform that evaluates AI agents, RAG pipelines, and LLMs with the same rigor you apply to traditional code.

This CLI brings evaluation straight to your terminal: run evals as part of CI/CD, catch regressions before they hit production, and block deploys that don't meet your quality thresholds.

---

## 🚀 30-second Quickstart

No installation. No signup. Just `curl`:

```bash
curl -s -X POST https://api.aievaluator.dev/api/v1/playground/evaluate \
  -H "Content-Type: application/json" \
  -d '{"queries":["What is 2+2?"],"metrics":["faithfulness"]}' | jq .
```

```json
{
  "results": [{
    "query": "What is 2+2?",
    "agent_response": "4",
    "scores": {"faithfulness": 1.0},
    "passed": true
  }],
  "remaining": 4
}
```

> ⚡ 5 free evals/day. No signup. No API key. For CI/CD: `aievaluator login` → 100 free/month.

---

## 📦 Install

| Language | Command |
|---|---|
| Python | `pip install aievaluator` |
| Node.js | `npm install -g aievaluator` |
| C# / .NET | `dotnet tool install -g aievaluator` |
| Go | `go install github.com/aievaluator-dev/aievaluator-cli/go/cmd/aievaluator@latest` |
| VS Code | Search "AI Evaluator" in Extensions |

---

## 🧭 Progressive Guide

The CLI is designed so you can start in 10 seconds and go as deep as you need.

| Level | What you learn | Time |
|:-----:|----------------|:----:|
| **0** | Evaluate a single prompt, no install, no key | 30s |
| **1** | Install CLI, quick eval with expected output | 1m |
| **2** | Scaffold a project, evaluate a dataset | 2m |
| **3** | Quality gates with thresholds per metric | 2m |
| **4** | Custom evaluators inline (bring your own criteria) | 1m |
| **5** | CI/CD pipeline integration | 2m |

📖 **Full progressive tutorials per language:**
[Python](./python/README.md) · [Node.js](./node/README.md) · [C#](./dotnet/README.md) · [Go](./go/README.md) · [VS Code](./vscode/README.md)

---

## 📋 Commands

| Command | Auth | What it does |
|---|---|---|
| `aievaluator quick` | ❌ | Evaluate a prompt or dataset via playground (5/day free) |
| `aievaluator login` | — | Save your API key (100 free/month) |
| `aievaluator whoami` | ✅ | Show your account tier and usage |
| `aievaluator init` | — | Create evals/ folder + sample dataset + config |
| `aievaluator eval` | ✅ | Full evaluation against your agent with quality gates |
| `aievaluator config` | — | Manage default metrics, thresholds, engine URL |

---

## 🎯 Key Features

### Per-metric thresholds

Set different quality bars for different metrics:

```bash
# faithfulness must be ≥ 90%, g_eval must be ≥ 75%
aievaluator quick "test" --metrics faithfulness:0.90,g_eval:0.75

# Same, using eval with your agent
aievaluator eval --agent $URL --dataset ./tests.json \
  --thresholds faithfulness:0.90,g_eval:0.75
```

### General threshold (min-score)

One number for all metrics:

```bash
aievaluator quick "test" --min-score 0.80
# Applies 0.80 to faithfulness AND g_eval. Exit code 1 if any fails.
```

### Custom evaluators (bring your own criteria)

Define a custom evaluation inline — no dashboard needed:

```bash
aievaluator eval --agent $URL --dataset ./tests.json \
  --metrics politeness \
  --custom '{"name":"politeness","prompt":"Is the response polite?","threshold":0.85}'
```

### JSONL dataset support

Both `.json` and `.jsonl` files work everywhere:

```bash
aievaluator eval --agent $URL --dataset ./queries.jsonl --min-score 0.80
```

---

## 🔧 CI/CD Integration

```bash
# Same command works in any CI system:
aievaluator eval \
  --agent $STAGING_AGENT \
  --dataset ./evals/regression.json \
  --min-score 0.80 \
  --ci \
  --format junit > report.xml

# Exit code 1 blocks the pipeline if quality drops
```

| CI System | How |
|---|---|
| GitHub Actions | `--format junit` + `actions/upload-artifact` |
| GitLab CI | `--format junit` + `reports:junit` |
| Jenkins | `--format junit` + `junit 'report.xml'` |
| Any CI | `--ci --format json` + parse exit code |

---

## ⚙️ Configuration

| Priority | Source |
|:--------:|--------|
| 1 | `--api-key` / `--engine-url` flags |
| 2 | `AIEVALUATOR_API_KEY` / `AIEVALUATOR_ENGINE_URL` env vars |
| 3 | `./aievaluator.config.json` (project-local) |
| 4 | `~/.config/aievaluator/config.json` (global) |

---

## 📁 Monorepo Structure

```
aievaluator-cli/
├── python/          → PyPI (pip install aievaluator)
├── node/            → npm (npm install -g aievaluator)
├── dotnet/          → NuGet (dotnet tool install -g aievaluator)
├── go/              → go install
├── vscode/          → VS Code Marketplace
├── shared/          → API surface + format specs
└── ci-templates/    → GitHub Actions / GitLab CI / Jenkins
```

## 🤝 Contributing

```bash
git clone https://github.com/aievaluator-dev/aievaluator-cli.git
cd aievaluator-cli
# Python: cd python && pip install -e ".[dev]" && pytest
# Node:   cd node && npm ci && npm test
# Go:     cd go && go test ./...
# .NET:   cd dotnet && dotnet test
```

## 👤 Author

**Franco Vinciarelli**

[![GitHub](https://img.shields.io/badge/GitHub-@fvinciarelli-181717?logo=github)](https://github.com/fvinciarelli)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Franco%20Vinciarelli-0A66C2?logo=linkedin)](https://www.linkedin.com/in/vinciarellifranco/)

## 📄 License

MIT © [AI Evaluator](https://aievaluator.dev)
