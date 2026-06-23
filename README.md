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
  <a href="https://gitlab.com/aievaluator/aievaluator-cli/-/pipelines"><img src="https://gitlab.com/aievaluator/aievaluator-cli/badges/master/pipeline.svg" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
</p>

---

## What is AI Evaluator?

**[AI Evaluator](https://aievaluator.dev)** is an LLM-as-a-Judge platform that evaluates AI agents, RAG pipelines, and LLMs with the same rigor you apply to traditional code.

This CLI brings evaluation straight to your terminal:
- Run evals as part of your CI/CD pipeline
- Catch regressions before they hit production
- Block deploys that don't meet your quality thresholds

---

## 🚀 Quickstart (30 seconds)

No installation. No signup. Just `curl`:

```bash
curl -s -X POST https://api.aievaluator.dev/api/v1/playground/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "queries": ["What is 2+2?"],
    "agent_endpoint": "/chat",
    "metrics": ["faithfulness"]
  }' | jq .
```

```json
{
  "results": [{
    "query": "What is 2+2?",
    "agent_response": "4",
    "scores": {"faithfulness": 1.0},
    "passed": true
  }],
  "remaining": 4,
  "playground": true
}
```

> ⚡ **5 free evals/day. No signup. No API key.** Ready for CI/CD? `aievaluator login` → 100 free/month.

---

## 📦 Install

| Language | Command |
|---|---|
| Python | `pip install aievaluator` |
| Node.js | `npm install -g aievaluator` |
| C# / .NET | `dotnet tool install -g aievaluator` |
| Go | `go install gitlab.com/aievaluator/aievaluator-cli/go/cmd/aievaluator@latest` |

---

## 🖥️ Usage (2-minute flow)

```bash
# 1. Install
pip install aievaluator                        # or npm / dotnet / go

# 2. Try it free (no signup)
aievaluator quick "Hello" --expected "Hi!" --metrics faithfulness

# 3. Sign up for more (100 free evals/month)
aievaluator login                              # get your key at aievaluator.dev/settings

# 4. Create a test dataset
echo '[{"input":"Hello","expected_output":"Hi!"},{"input":"Bye","expected_output":"Goodbye"}]' > smoke.json

# 5. Evaluate your agent
aievaluator eval \
  --agent https://my-agent.com/chat \
  --dataset ./smoke.json \
  --metrics faithfulness,g_eval \
  --min-score 0.80

# 6. Exit code: 0 = passed, 1 = below threshold
```

---

## 📋 Commands

| Command | Description | Auth |
|---|---|---|
| `aievaluator quick` | Quick eval via playground | ❌ No |
| `aievaluator login` | Authenticate with API key | — |
| `aievaluator whoami` | Show tenant info and usage | ✅ API Key |
| `aievaluator eval` | Full evaluation against an agent | ✅ API Key |
| `aievaluator config` | Manage CLI configuration | — |
| `aievaluator init` | Scaffold a new eval project | — |

---

## 🎮 Playground vs API Key

| | Playground | API Key (free tier) |
|---|---|---|
| **Signup** | No | Yes (free) |
| **Daily limit** | 5 evals | 100 evals/month |
| **CI/CD** | No | ✅ |
| **Custom metrics** | No | ✅ |
| **Quality gates** | No | ✅ `--min-score` |
| **Best for** | Trying it out | Production CI/CD |

---

## 🔧 CI/CD Integration

```bash
# GitHub Actions / GitLab CI / Jenkins — same command:
aievaluator eval \
  --agent $STAGING_AGENT \
  --dataset ./evals/regression.json \
  --min-score 0.80 \
  --ci \
  --format junit > report.xml

# Exit code 1 blocks the pipeline if quality drops
```

| CI System | Integration |
|---|---|
| GitHub Actions | `--format junit` + `actions/upload-artifact` |
| GitLab CI | `--format junit` + `reports:junit` |
| Jenkins | `--format junit` + `junit 'report.xml'` |
| Any CI | `--ci --format json` + parse exit code |

---

## 📊 Output Formats

### Table (default)

```
┌──────────────────────────────────────────────────────────┐
│  AI Evaluator — Results                                  │
├──────────────────────────────────────────────────────────┤
│  Overall Score:  87.5%  ✅ above threshold (80%)        │
│  Total rows:     8                                       │
│  Failed:         1                                       │
│  Tokens:         ↓4,200 · ↑1,800                         │
├────┬────────────────────────────────────┬────────┬───────┤
│  # │ Query                              │ Score  │ Pass  │
├────┼────────────────────────────────────┼────────┼───────┤
│  1 │ What is 2+2?                       │  95%   │  ✅   │
│  2 │ Capital of France?                 │  90%   │  ✅   │
│  3 │ Explain quantum computing          │  72%   │  ❌   │
└────┴────────────────────────────────────┴────────┴───────┘
```

### JSON (`--format json`)

```json
{
  "evaluation_id": "uuid-here",
  "overall_score": 0.875,
  "passed": true,
  "total_rows": 8,
  "failed_queries": 1,
  "results": [...]
}
```

### JUnit XML (`--format junit`)

```xml
<?xml version="1.0"?>
<testsuite name="AI Evaluator" tests="8" failures="1">
  <testcase name="Query 1: What is 2+2?"></testcase>
  <testcase name="Query 2: Capital of France?">
    <failure message="Score 0.72 below threshold 0.80">...</failure>
  </testcase>
</testsuite>
```

---

## ⚙️ Configuration

| Priority | Source |
|:--------:|--------|
| 1 | `--api-key` / `--engine-url` flags |
| 2 | `AIEVALUATOR_API_KEY` / `AIEVALUATOR_ENGINE_URL` env vars |
| 3 | `./aievaluator.config.json` (project-local) |
| 4 | `~/.config/aievaluator/config.json` (global) |

```bash
aievaluator config show                  # Show current config
aievaluator config set default-metrics "faithfulness,g_eval"
aievaluator login                        # Saves API key to global config
```

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

> 📖 Language-specific docs: [Python](./python/README.md) · [Node.js](./node/README.md) · [C#](./dotnet/README.md) · [Go](./go/README.md)

---

## 🤝 Contributing

```bash
git clone https://gitlab.com/aievaluator/aievaluator-cli.git
cd aievaluator-cli

# Python
cd python && pip install -e ".[dev]" && pytest

# Node
cd node && npm ci && npm test

# Go
cd go && go test ./...

# .NET
cd dotnet && dotnet test
```

---

## 📄 License

MIT © [AI Evaluator](https://aievaluator.dev)

---

## 🔗 Links

- [AI Evaluator](https://aievaluator.dev) — Platform dashboard
- [API Docs](https://api.aievaluator.dev/docs) — Swagger UI
- [Issues](https://gitlab.com/aievaluator/aievaluator-cli/-/issues)
- [Support](mailto:support@aievaluator.dev)
