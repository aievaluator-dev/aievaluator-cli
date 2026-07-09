# AI Evaluator CLI — Go

Evaluate your LLM agents from the terminal. No browser. No dashboard.

```bash
go install github.com/aievaluator-dev/aievaluator-cli/go/cmd/aievaluator@latest
```

---

## 🧭 Tutorial — From Zero to CI/CD

---

### Level 0 — Try without installing

```bash
curl -s -X POST https://api.aievaluator.dev/api/v1/playground/evaluate \
  -H "Content-Type: application/json" \
  -d '{"queries":["What is 2+2?"],"metrics":["faithfulness"]}' | jq .
```

---

### Level 1 — Install and quick eval

```bash
go install github.com/aievaluator-dev/aievaluator-cli/go/cmd/aievaluator@latest

aievaluator quick "What is the capital of France?" --expected "Paris"
```

---

### Level 2 — Scaffold and login

```bash
aievaluator login
aievaluator whoami
aievaluator init
aievaluator quick --dataset ./evals/smoke-test.json
```

---

### Level 3 — Evaluate your agent

```bash
aievaluator eval \
  --agent https://chatbot-staging.acme.com/api/chat \
  --dataset ./evals/smoke-test.json \
  --metrics faithfulness,g_eval
```

---

### Level 4 — Per-metric thresholds

```bash
# faithfulness ≥ 90%, g_eval ≥ 75%
aievaluator eval --agent $URL --dataset ./tests.json \
  --thresholds faithfulness:0.90,g_eval:0.75

# One bar for everything
aievaluator eval --agent $URL --dataset ./tests.json --min-score 0.80

# Quick eval with thresholds
aievaluator quick "test" --metrics faithfulness:0.90,g_eval:0.75
aievaluator quick "test" --min-score 0.80
```

---

### Level 5 — Custom evaluators

```bash
aievaluator eval --agent $URL --dataset ./tests.json \
  --metrics politeness,g_eval \
  --custom '{"name":"politeness","prompt":"Is the response polite and professional?","threshold":0.85}'
```

---

### Level 6 — CI/CD

```bash
aievaluator eval \
  --agent $STAGING_AGENT \
  --dataset ./evals/regression.json \
  --thresholds faithfulness:0.90,g_eval:0.75 \
  --min-score 0.80 \
  --ci \
  --format junit > report.xml
```

```bash
export AIEVALUATOR_API_KEY="sk-..."
```

---

## 📋 Commands

### `aievaluator quick`
```bash
aievaluator quick "test" --expected "result"
aievaluator quick "test" --metrics faithfulness:0.90,g_eval:0.75
aievaluator quick "test" --min-score 0.80
aievaluator quick --dataset ./tests.json
aievaluator quick --dataset ./tests.jsonl
```

### `aievaluator eval`
```bash
aievaluator eval --agent $URL --dataset ./tests.json
aievaluator eval --agent $URL --dataset ./tests.json \
  --thresholds faithfulness:0.90,g_eval:0.75 --min-score 0.80
aievaluator eval --agent $URL --dataset ./tests.json \
  --metrics my-eval --custom '{"name":"my-eval","prompt":"...","threshold":0.8}'
aievaluator eval --agent $URL --dataset ./tests.json --ci --format junit
```

### `aievaluator config`
```bash
aievaluator config show
aievaluator config set default-metrics "faithfulness,g_eval"
aievaluator config set default-min-score 0.80
```

### `aievaluator login` / `whoami` / `init` / `generate-ci`
```bash
aievaluator login
aievaluator whoami
aievaluator init

# Generate CI/CD workflow (GitHub Actions or GitLab CI)
aievaluator generate-ci --platform github
aievaluator generate-ci --platform gitlab --output .gitlab-ci.yml
```

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

- Go 1.22+
