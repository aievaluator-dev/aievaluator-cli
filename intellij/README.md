# AI Evaluator — IntelliJ Plugin

[![JetBrains Marketplace](https://img.shields.io/badge/JetBrains-Marketplace-blue)](https://plugins.jetbrains.com)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](../../../LICENSE)

**Ship AI agents with confidence.** Evaluate your LLM agents directly from IntelliJ IDEA, WebStorm, PyCharm, GoLand, Rider, and any JetBrains IDE.

## Features

- **Quick Eval** — Select text → right-click → get scores instantly
- **Dataset Evaluation** — Right-click any `.json`/`.jsonl` → evaluate all queries
- **Sidebar Tool Window** — View → Tool Windows → AI Evaluator
- **Custom Evaluators** — Define your own LLM-as-a-Judge criteria
- **CI/CD Snippets** — One-click GitHub Actions / GitLab CI workflow
- **API Key in Settings** — Stored securely via IDE settings

## Quickstart

1. Install from JetBrains Marketplace → search "AI Evaluator"
2. View → Tool Windows → AI Evaluator
3. Select text in any file → click "▶ Quick eval" in the sidebar
4. Or right-click a `.json` dataset file → "AI Evaluator: Evaluate this dataset"

> ⚡ 5 free evals/day. 100/month free with API key → [aievaluator.dev](https://www.aievaluator.dev)

## Compatible IDEs

- IntelliJ IDEA (Community & Ultimate)
- WebStorm
- PyCharm
- GoLand
- Rider
- PhpStorm
- DataGrip
- CLion

## Development

```bash
# Build
./gradlew buildPlugin

# Run in sandbox
./gradlew runIde

# Package
./gradlew buildPlugin
```
