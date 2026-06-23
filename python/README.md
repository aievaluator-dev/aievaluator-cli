# AI Evaluator CLI — Python

[![PyPI version](https://img.shields.io/pypi/v/aievaluator)](https://pypi.org/project/aievaluator/)
[![Python](https://img.shields.io/pypi/pyversions/aievaluator)](https://pypi.org/project/aievaluator/)

Evaluate your LLM agents from the command line. No browser needed.

## Install

```bash
pip install aievaluator
```

## Quickstart

### 1. Try it free (no signup)

```bash
aievaluator quick "What is 2+2?" --expected "4"
```

> ⚡ 5 free evaluations/day via playground. No API key required.

### 2. Sign up for more

```bash
aievaluator login
# Get your API key at https://aievaluator.dev/settings
```

### 3. Evaluate your agent

```bash
aievaluator eval \
  --agent https://my-agent.com/chat \
  --dataset ./smoke-test.json \
  --metrics faithfulness,g_eval \
  --min-score 0.80
```

## Commands

| Command | Description |
|---|---|
| `aievaluator login` | Authenticate with AI Evaluator |
| `aievaluator whoami` | Show current tenant and usage |
| `aievaluator quick` | Quick eval via playground (no API key) |
| `aievaluator eval` | Full evaluation against an agent |
| `aievaluator config` | Manage CLI configuration |

## CI/CD

```bash
aievaluator eval \
  --agent $STAGING_AGENT \
  --dataset ./evals/regression.json \
  --min-score 0.80 \
  --ci \
  --format junit > report.xml
```

Exit code 1 if score < threshold. Compatible with GitHub Actions, GitLab CI, Jenkins.

## Requirements

- Python 3.10+
