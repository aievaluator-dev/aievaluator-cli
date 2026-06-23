# AI Evaluator — VS Code Extension

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/aievaluator.aievaluator?label=VS%20Code)](https://marketplace.visualstudio.com/items?itemName=aievaluator.aievaluator)

Evaluate your AI agents without leaving your editor.

## Features

- 🧪 **Quick eval** — Select text, right-click, get a score. No signup.
- 🤖 **Agent picker** — Use the internal agent or point to your own endpoint.
- 📊 **Dataset evaluation** — Right-click any `.json` dataset → evaluate all queries.
- 📋 **Sidebar with history** — Track your last 20 evaluations.
- 🔑 **API key management** — Securely stored in VS Code secrets.
- ⚙️ **Workspace settings** — Default agent, metrics, engine URL.
- 🚀 **CI/CD snippet generator** — One command to get a GitHub Actions workflow.

## Install

Search "AI Evaluator" in VS Code Extensions, or:

```bash
code --install-extension aievaluator.aievaluator
```

## Quickstart

1. Open any file, select a prompt: `What is the capital of France?`
2. Right-click → **"AI Evaluator: Evaluate from editor"**
3. Choose agent → choose metrics → Enter
4. See score: `g_eval: 92% ✅`

> ⚡ 5 free evals/day via playground. Set an API key for 100 free/month.

## Tutorial

See [TUTORIAL.md](./TUTORIAL.md) for a 10-section walkthrough.

## Debug

See [DEBUG.md](./DEBUG.md) to run the extension in development mode.

> Full docs: [README raíz](../README.md)
