# AI Evaluator CLI — Rust 🦀

Blazingly fast CLI for evaluating LLM agents, RAG pipelines, and AI systems.

## 📦 Install

```bash
cargo install aievaluator
```

Or build from source:

```bash
git clone https://github.com/aievaluator-dev/aievaluator-cli.git
cd aievaluator-cli/rust
cargo build --release
./target/release/aievaluator --help
```

## 🚀 Quickstart

```bash
# 5 free evals/day, no signup
aievaluator quick "What is 2+2?"

# Or with a dataset
aievaluator quick --dataset ./evals/smoke-test.json

# Login for 100 free/month
aievaluator login
aievaluator eval --agent $AGENT_URL --dataset ./tests.json --min-score 0.80
```

## 📋 Commands

| Command | Description |
|---------|-------------|
| `aievaluator login` | Save API key |
| `aievaluator whoami` | Show tenant info |
| `aievaluator quick` | Playground eval (no key, 5/day) |
| `aievaluator eval` | Full evaluation with quality gates |
| `aievaluator config show/set/unset` | Manage settings |
| `aievaluator init` | Scaffold eval project |
| `aievaluator generate-ci` | Generate CI/CD workflow |

## 🔧 CI/CD

```bash
aievaluator generate-ci --platform github
aievaluator generate-ci --platform gitlab
aievaluator generate-ci --platform kubernetes
```

## ⚙️ Configuration priority

1. CLI flags (`--api-key`, `--engine-url`)
2. Environment: `AIEVALUATOR_API_KEY`, `AIEVALUATOR_ENGINE_URL`
3. Project-local: `./aievaluator.config.json`
4. Global: `~/.config/aievaluator/config.json`

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

## 📄 License

MIT © [AI Evaluator](https://aievaluator.dev)
