# AI Evaluator — Visual Studio Extension

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/aievaluator.aievaluator-vs?label=VS%20Marketplace&color=6A5ACD)](https://marketplace.visualstudio.com/items?itemName=aievaluator.aievaluator-vs)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./Resources/LICENSE.txt)

**Ship AI agents with confidence.** Evaluate your LLM agents directly from Visual Studio 2022.

## Features

- **Quick Eval** — Select text, right-click → Evaluate, get scores instantly
- **Dataset Evaluation** — Right-click any `.json`/`.jsonl` → evaluate all queries
- **Sidebar Panel** — View → AI Evaluator (docked next to Solution Explorer)
- **Custom Evaluators** — Define your own LLM-as-a-Judge criteria
- **CI/CD Snippets** — One-click GitHub Actions / GitLab CI workflow
- **API Key Management** — Set and store securely via VS Settings

## Quickstart

1. Install from [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=aievaluator.aievaluator-vs)
2. View → Other Windows → AI Evaluator
3. Select text in any file → click "▶ Quick eval"
4. Or right-click a `.json` dataset file → "AI Evaluator: Evaluate this dataset"

> ⚡ 5 free evals/day. 100/month free with API key → [aievaluator.dev](https://www.aievaluator.dev)

## Requirements

- Visual Studio 2022 (17.0+) — Community, Professional, or Enterprise
- .NET Desktop Development workload
- Windows 10+ / Windows Server 2019+

## Development

```bash
# Build
dotnet build src/

# Package
msbuild /t:Build /p:Configuration=Release
```
