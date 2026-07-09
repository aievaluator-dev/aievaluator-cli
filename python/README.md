# AI Evaluator CLI — Python

[![PyPI](https://img.shields.io/pypi/v/aievaluator)](https://pypi.org/project/aievaluator/)
[![Python](https://img.shields.io/pypi/pyversions/aievaluator)](https://pypi.org/project/aievaluator/)

Evaluate your LLM agents from the terminal. No browser. No dashboard.

```bash
pip install aievaluator
```

---

## 🧭 Tutorial — From Zero to CI/CD

Every step builds on the previous one. Start wherever makes sense for you.

---

### Level 0 — Try it without installing anything

```bash
curl -s -X POST https://api.aievaluator.dev/api/v1/playground/evaluate \
  -H "Content-Type: application/json" \
  -d '{"queries":["What is 2+2?"],"metrics":["faithfulness"]}' | jq .
```

5 free per day. No key. No install. Good enough to decide if it's useful.

---

### Level 1 — Install and evaluate a single prompt

```bash
pip install aievaluator

# Ask a question, tell it what you expect
aievaluator quick "What is the capital of France?" --expected "Paris"
```

You'll see a table with the score. The `--expected` is optional — without it, the judge evaluates
the response on its own merits.

```
⚠️  Playground mode — 4/5 remaining

  AI Evaluator — Results
  Overall Score:  95.0%  ✅ above threshold (0%)
  Total rows:     1
  Failed:         0

┌────┬────────────────────────────────────┬──────────┬──────┐
│  # │ Query                              │ Score    │ Pass │
├────┼────────────────────────────────────┼──────────┼──────┤
│  1 │ What is the capital of France?     │  95%     │ ✅   │
└────┴────────────────────────────────────┴──────────┴──────┘
```

---

### Level 2 — Sign up and scaffold a project

Playground is great for trying, but you'll want more than 5 evals/day.

```bash
# Get your API key at https://aievaluator.dev/settings
aievaluator login

# Check your account
aievaluator whoami
```

Now scaffold your project:

```bash
aievaluator init
```

This creates:
- `aievaluator.config.json` — project-local config
- `evals/smoke-test.json` — sample dataset with 3 queries
- Updates `.gitignore`

Open `evals/smoke-test.json` and replace the sample queries with your own:

```json
[
  {"input": "What are your business hours?", "expected_output": "Mon-Fri 9am-6pm"},
  {"input": "How do I cancel my order?", "expected_output": "Go to My Orders → Cancel"},
  {"input": "Do you ship internationally?", "expected_output": "Yes, via DHL Express"}
]
```

Test it against the built-in agent:

```bash
aievaluator quick --dataset ./evals/smoke-test.json
```

---

### Level 3 — Evaluate your own agent

Point the CLI at your agent's endpoint:

```bash
aievaluator eval \
  --agent https://chatbot-staging.acme.com/api/chat \
  --dataset ./evals/smoke-test.json \
  --metrics faithfulness,g_eval
```

The CLI calls your agent with each query, then an LLM judge scores the responses.

---

### Level 4 — Add quality gates

Not all metrics are equally important. Set different thresholds per metric:

```bash
aievaluator eval \
  --agent https://chatbot-staging.acme.com/api/chat \
  --dataset ./evals/smoke-test.json \
  --thresholds faithfulness:0.90,g_eval:0.75
```

- `faithfulness` must be ≥ 90% (hallucination = instant fail)
- `g_eval` must be ≥ 75% (general quality)

If any metric fails to meet its threshold, that row is marked ❌.

**Or set one bar for everything:**

```bash
aievaluator eval \
  --agent https://chatbot-staging.acme.com/api/chat \
  --dataset ./evals/smoke-test.json \
  --min-score 0.80
```

This works on `quick` too:

```bash
aievaluator quick "test prompt" --min-score 0.80
# Exit code 1 if any metric drops below 0.80
```

---

### Level 5 — Create your own evaluation criteria

Sometimes the built-in metrics aren't enough. Define a custom evaluator inline:

```bash
aievaluator eval \
  --agent https://chatbot-staging.acme.com/api/chat \
  --dataset ./evals/smoke-test.json \
  --metrics politeness,g_eval \
  --custom '{"name":"politeness","prompt":"Is the response polite and professional? Answer YES or NO and explain.","threshold":0.85}'
```

The custom evaluator `politeness` is defined in the request, referenced in `--metrics` by name,
and evaluated alongside `g_eval`. No dashboard needed.

**Custom evaluator with per-metric threshold override:**

```bash
aievaluator eval \
  --agent $URL --dataset ./tests.json \
  --metrics politeness,g_eval \
  --custom '{"name":"politeness","prompt":"Is the tone friendly?","threshold":0.7}' \
  --thresholds politeness:0.90,g_eval:0.80
```

The `--thresholds` flag overrides whatever was set in `--custom`. The engine uses the
per-evaluation value.

---

### Level 6 — CI/CD pipeline

Add this to your GitHub Actions, GitLab CI, or Jenkins:

```bash
aievaluator eval \
  --agent $STAGING_AGENT \
  --dataset ./evals/regression.json \
  --thresholds faithfulness:0.90,g_eval:0.75 \
  --min-score 0.80 \
  --ci \
  --format junit > report.xml
```

| Flag | What it does |
|---|---|
| `--ci` | No colors, no prompts — clean output for logs |
| `--format junit` | JUnit XML that CI systems understand natively |
| `--min-score 0.80` | Overall score must be ≥ 80% |
| `--thresholds` | Per-metric quality bars |

Exit code 1 = pipeline fails = deploy blocked.

**If your agent requires authentication:**

```bash
aievaluator eval \
  --agent $STAGING_AGENT \
  --agent-auth-type bearer \
  --agent-auth-token $AGENT_BEARER_TOKEN \
  --dataset ./evals/regression.json \
  --min-score 0.80 \
  --ci \
  --format junit > report.xml
```

Supported auth types: `none` (default), `api_key`, `bearer`. For `api_key`, the default header is `X-API-Key`. For `bearer`, the default header is `Authorization` with `Bearer <token>` format. Override with `--agent-auth-header`.

**Environment variables for CI:**

```bash
export AIEVALUATOR_API_KEY="sk-..."       # No hardcoded keys in YAML
export AIEVALUATOR_ENGINE_URL="https://api.aievaluator.dev"
```

---

## 📋 Complete Command Reference

### `aievaluator login`

```bash
aievaluator login                        # Interactive prompt
aievaluator login --api-key sk-xxx       # Non-interactive (CI)
aievaluator login --engine-url https://custom.engine.com
```

### `aievaluator whoami`

```bash
aievaluator whoami
# Tenant:  acme-corp
# Tier:    pro
# Evals:   42/5000 this cycle
# Tokens:  ↓124,800 · ↑89,200 this cycle
```

### `aievaluator quick`

```bash
# Single query
aievaluator quick "What is 2+2?" --expected "4"

# Per-metric thresholds
aievaluator quick "test" --metrics faithfulness:0.90,g_eval:0.75

# General threshold
aievaluator quick "test" --min-score 0.80

# From dataset (JSON or JSONL)
aievaluator quick --dataset ./tests.json
aievaluator quick --dataset ./tests.jsonl

# Custom judge model
aievaluator quick "test" --judge deepseek

# With agent authentication
aievaluator quick --dataset ./tests.json \
  --agent-auth-type bearer --agent-auth-token "sk-abc123"
```

### `aievaluator eval`

```bash
# Basic
aievaluator eval --agent $URL --dataset ./tests.json

# With agent authentication (Bearer token)
aievaluator eval --agent $URL --dataset ./tests.json \
  --agent-auth-type bearer --agent-auth-token "sk-abc123"

# With agent authentication (API key)
aievaluator eval --agent $URL --dataset ./tests.json \
  --agent-auth-type api_key --agent-auth-header "X-API-Key" --agent-auth-token "my-secret"

# With quality gates
aievaluator eval --agent $URL --dataset ./tests.json \
  --thresholds faithfulness:0.90,g_eval:0.75 --min-score 0.80

# Inline rows
aievaluator eval --agent $URL \
  --rows '[{"input":"Hi","expected_output":"Hello"}]'

# Custom evaluator inline
aievaluator eval --agent $URL --dataset ./tests.json \
  --metrics my-eval --custom '{"name":"my-eval","prompt":"...","threshold":0.8}'

# CI mode
aievaluator eval --agent $URL --dataset ./tests.json --ci --format junit

# Different agent format
aievaluator eval --agent $URL --dataset ./tests.json --agent-format claude

# Agent authentication (API key or Bearer token)
aievaluator eval --agent $URL --dataset ./tests.json \
  --agent-auth-type bearer --agent-auth-token "sk-abc123"

aievaluator eval --agent $URL --dataset ./tests.json \
  --agent-auth-type api_key --agent-auth-header "X-API-Key" --agent-auth-token "my-key"
```

### `aievaluator config`

```bash
aievaluator config show
aievaluator config set default-metrics "faithfulness,g_eval"
aievaluator config set default-min-score 0.80
aievaluator config unset default-min-score
```

### `aievaluator init`

```bash
aievaluator init
# Creates aievaluator.config.json + evals/smoke-test.json + updates .gitignore
```

### `aievaluator generate-ci`

Generates a CI/CD workflow file for GitHub Actions or GitLab CI.

```bash
aievaluator generate-ci --platform github
```

Options:
| Flag | Default | Description |
|---|---|---|
| `--platform github\|gitlab` | `github` | CI/CD platform |
| `--dataset` | `./evals/regression.json` | Dataset path |
| `--output` | stdout | Save to file |

```bash
# Print GitHub Actions workflow
aievaluator generate-ci --platform github

# Save GitLab CI workflow to file
aievaluator generate-ci --platform gitlab --output .gitlab-ci.yml
```

---

## 📊 Output Formats

### Table (default)

Human-readable table with scores, pass/fail icons, and token counts.

### JSON (`--format json`)

```bash
aievaluator eval ... --format json | jq '.overall_score'
```

Clean JSON on stdout. All logs/warnings go to stderr.

### JUnit XML (`--format junit`)

```bash
aievaluator eval ... --format junit > report.xml
```

Native CI integration. `<testcase>` per query, `<failure>` for queries below threshold.

---

## 🌐 Evaluating local agents

Use `--tunnel` to evaluate agents running on `localhost` or private networks:

```bash
aievaluator eval --agent http://localhost:8047/chat --tunnel --dataset ./tests.json
aievaluator quick "Hello" --agent http://localhost:8047/chat --tunnel
```

The CLI auto-detects local URLs and creates a public tunnel via **cloudflared** (free, no signup),
**ngrok**, **bore**, or **localtunnel**. The tunnel is closed automatically when the evaluation finishes.

Install cloudflared: `brew install cloudflared`

---

## Requirements

- Python 3.10+
