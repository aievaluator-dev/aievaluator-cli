# AI Evaluator CLI — Node.js

[![npm](https://img.shields.io/npm/v/aievaluator)](https://www.npmjs.com/package/aievaluator)
[![Node](https://img.shields.io/node/v/aievaluator)](https://www.npmjs.com/package/aievaluator)

Evaluate your LLM agents from the terminal. No browser. No dashboard.

```bash
npm install -g aievaluator
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

5 free per day. No key. No install.

---

### Level 1 — Install and evaluate a single prompt

```bash
npm install -g aievaluator

aievaluator quick "What is the capital of France?" --expected "Paris"
```

You'll see a table with the score.

---

### Level 2 — Sign up and scaffold a project

```bash
aievaluator login          # Get your key at https://aievaluator.dev/settings
aievaluator whoami         # Check your account

aievaluator init           # Creates evals/smoke-test.json + config + .gitignore
```

Edit `evals/smoke-test.json` with your own queries, then:

```bash
aievaluator quick --dataset ./evals/smoke-test.json
```

---

### Level 3 — Evaluate your own agent

```bash
aievaluator eval \
  --agent https://chatbot-staging.acme.com/api/chat \
  --dataset ./evals/smoke-test.json \
  --metrics faithfulness,g_eval
```

---

### Level 4 — Quality gates with per-metric thresholds

Set different bars for different metrics:

```bash
# faithfulness ≥ 90%, g_eval ≥ 75%
aievaluator eval --agent $URL --dataset ./tests.json \
  --thresholds faithfulness:0.90,g_eval:0.75
```

Or one bar for everything:

```bash
aievaluator eval --agent $URL --dataset ./tests.json --min-score 0.80
```

Works on `quick` too:

```bash
aievaluator quick "test" --min-score 0.80
aievaluator quick "test" --metrics faithfulness:0.90,g_eval:0.75
```

---

### Level 5 — Custom evaluators inline

```bash
aievaluator eval --agent $URL --dataset ./tests.json \
  --metrics politeness,g_eval \
  --custom '{"name":"politeness","prompt":"Is the response polite and professional?","threshold":0.85}'
```

Combine with per-metric thresholds:

```bash
aievaluator eval --agent $URL --dataset ./tests.json \
  --metrics politeness,g_eval \
  --custom '{"name":"politeness","prompt":"Is the tone friendly?","threshold":0.7}' \
  --thresholds politeness:0.90,g_eval:0.80
```

---

### Level 6 — CI/CD pipeline

```bash
aievaluator eval \
  --agent $STAGING_AGENT \
  --dataset ./evals/regression.json \
  --thresholds faithfulness:0.90,g_eval:0.75 \
  --min-score 0.80 \
  --ci \
  --format junit > report.xml
```

Env vars for CI:

```bash
export AIEVALUATOR_API_KEY="sk-..."
export AIEVALUATOR_ENGINE_URL="https://api.aievaluator.dev"
```

---

## 📋 Complete Command Reference

### `aievaluator login`
```bash
aievaluator login
aievaluator login --api-key sk-xxx
```

### `aievaluator whoami`
```bash
aievaluator whoami
```

### `aievaluator quick`
```bash
# Single query
aievaluator quick "What is 2+2?" --expected "4"

# Per-metric thresholds
aievaluator quick "test" --metrics faithfulness:0.90,g_eval:0.75

# General threshold
aievaluator quick "test" --min-score 0.80

# Dataset (JSON or JSONL)
aievaluator quick --dataset ./tests.json
aievaluator quick --dataset ./tests.jsonl

# Custom judge
aievaluator quick "test" --judge deepseek
```

### `aievaluator eval`
```bash
# Basic
aievaluator eval --agent $URL --dataset ./tests.json

# Quality gates
aievaluator eval --agent $URL --dataset ./tests.json \
  --thresholds faithfulness:0.90,g_eval:0.75 --min-score 0.80

# Inline rows
aievaluator eval --agent $URL \
  --rows '[{"input":"Hi","expected_output":"Hello"}]'

# Custom evaluator
aievaluator eval --agent $URL --dataset ./tests.json \
  --metrics my-eval --custom '{"name":"my-eval","prompt":"...","threshold":0.8}'

# CI mode
aievaluator eval --agent $URL --dataset ./tests.json --ci --format junit
```

### `aievaluator config`
```bash
aievaluator config show
aievaluator config set default-metrics "faithfulness,g_eval"
aievaluator config set default-min-score 0.80
```

### `aievaluator init`
```bash
aievaluator init
```

### `aievaluator generate-ci`
```bash
# Generate CI/CD workflow (GitHub Actions or GitLab CI)
aievaluator generate-ci --platform github
aievaluator generate-ci --platform gitlab --output .gitlab-ci.yml
```

---

## 📊 Output Formats

- **Table** (default) — human-readable with scores and pass/fail icons
- **JSON** (`--format json`) — clean JSON on stdout, logs on stderr
- **JUnit** (`--format junit`) — native CI integration, `<testcase>` per query

---

## Requirements

- Node.js 18+
