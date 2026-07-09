# API Surface — AI Evaluator CLI

> Common contract for all CLI clients (Python, Node, Go, C#).
> Each language implements exactly these commands, flags, and behaviors.

---

## Commands

### `aievaluator login`

Authenticates the user with AI Evaluator.

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--api-key` | string | No | — | API key (non-interactive mode) |
| `--engine-url` | string | No | `https://api.aievaluator.dev` | Engine API base URL |

**Behavior:**
- Without `--api-key`: interactive prompt asking for the key
- Saves to `~/.config/aievaluator/config.json`
- Confirms with: "✅ Logged in as {tenant_name} ({tier})"
- Exit code: 0 if OK, 2 on failure

---

### `aievaluator whoami`

Shows authenticated tenant info. No flags.

**Behavior:**
- Reads API key from config
- Calls `GET /api/v1/tenants/me/usage`
- Displays: Tenant, Tier, Evals, Tokens

---

### `aievaluator quick`

Quick evaluation without API key using the playground.

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `[query]` | string | Conditional | — | Single query (positional argument) |
| `--dataset` | path | Conditional | — | JSON or JSONL file with queries |
| `--agent` | string | No | `/chat` | Agent endpoint URL |
| `--expected` | string | No | — | Expected output for single query |
| `--metrics` | string | No | `faithfulness,g_eval` | Metrics: bare names or `name:threshold` |
| `--min-score` | float | No | — | Global threshold applied to all metrics |
| `--judge` | string | No | `deepseek` | LLM judge model |
| `--engine-url` | string | No | `https://api.aievaluator.dev` | Engine URL |
| `--tunnel` | flag | No | false | Expose local agent via cloudflared/ngrok tunnel |

**How to use `--metrics`:**
- `faithfulness,g_eval` — metrics without threshold (uses engine defaults)
- `faithfulness:0.90,g_eval:0.75` — each metric with its own threshold
- If `--min-score 0.8` is used without individual thresholds, 0.8 applies to all

**Behavior:**
- Without API key — uses `POST /api/v1/playground/evaluate`
- ⚠️ Exactly one of `[query]` or `--dataset`
- Accepts `.json` and `.jsonl`
- If `--min-score` is set, exit code 1 if any result fails

---

### `aievaluator eval`

Full evaluation with API key against an agent.

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--agent` | string | ✅ | — | Agent endpoint URL |
| `--dataset` | path | Conditional | — | JSON/JSONL file with test cases |
| `--rows` | JSON | Conditional | — | Inline JSON array of test cases |
| `--metrics` | string | No | `faithfulness,g_eval` | Metrics (comma-separated, accepts UUIDs) |
| `--agent-format` | string | No | `openai` | `openai`, `claude`, `custom` |
| `--min-score` | float | No | `0.0` | Overall threshold (0-1) |
| `--thresholds` | string | No | — | Per-metric: `faithfulness:0.90,g_eval:0.75` |
| `--custom` | JSON | No | — | Inline custom evaluator `{"name":"x","prompt":"...","threshold":0.8}` |
| `--format` | string | No | `table` | `table`, `json`, `junit` |
| `--ci` | flag | No | false | CI mode (no colors, no prompts) |
| `--timeout` | int | No | `300` | Timeout in seconds |
| `--judge-model` | string | No | `deepseek` | LLM judge model |
| `--name` | string | No | — | Descriptive name for this eval |
| `--api-key` | string | No | — | API key (overrides config) |
| `--engine-url` | string | No | — | Engine URL |
| `--tunnel` | flag | No | false | Expose local agent via cloudflared/ngrok tunnel |

**Threshold modes:**
- `--min-score 0.80` — overall_score must be ≥ 0.80
- `--thresholds faithfulness:0.90,g_eval:0.75` — each metric with its threshold
- Both can be combined: `--min-score 0.70 --thresholds faithfulness:0.90`

**Custom evaluators inline (CU3):**
- `--metrics my_eval --custom '{"name":"my_eval","prompt":"Is X true?","threshold":0.8}'`
- The custom evaluator is defined in the request and referenced by name in `--metrics`

---

### `aievaluator config`

| Subcommand | Description |
|---|---|
| `config show` | Shows current configuration |
| `config set <key> <value>` | Sets a value |
| `config unset <key>` | Removes a value |

**Keys:** `engine-url`, `default-metrics`, `default-min-score`

---

### `aievaluator init`

Creates scaffolding in the current directory:
- `aievaluator.config.json` with defaults
- `evals/smoke-test.json` (sample dataset)
- Updates `.gitignore`

---

## Exit codes

| Code | Meaning |
|:----:|--------|
| 0 | OK — evaluation passed the threshold |
| 1 | Score < min-score or some result failed |
| 2 | Configuration error |
| 3 | Network error / engine unavailable |

---

## Tunnel

When `--tunnel` is passed, if the agent URL points to localhost or a private network,
the CLI automatically creates a public tunnel so the cloud engine can reach the agent.

### Detection

URLs containing any of these are considered local:
- `localhost`
- `127.0.0.1`
- `0.0.0.0`
- `192.168.`
- `10.`

If the URL is not local, `--tunnel` prints a note and is ignored.

### Providers (tried in order)

| # | Binary | Command | Signup |
|---|--------|---------|--------|
| 1 | `cloudflared` | `tunnel --url http://localhost:{port}` | No (recommended) |
| 2 | `ngrok` | `http {port} --log=stdout` | Yes (free tier) |
| 3 | `bore` | `local {port} --to bore.pub` | No |
| 4 | `lt` (localtunnel) | `--port {port}` | No |

### Behavior

- 15-second timeout waiting for the public URL
- Tunnel is closed automatically after evaluation (success or failure)
- If no tunnel tool is installed, the CLI prints install instructions and exits with code 2

---

## Environment variables

| Variable | Description |
|---|---|
| `AIEVALUATOR_API_KEY` | API key |
| `AIEVALUATOR_ENGINE_URL` | Engine URL |
