# API Surface — AI Evaluator CLI

> Contrato común para todos los clientes CLI (Python, Node, Go, C#).
> Cada lenguaje implementa exactamente estos comandos, flags, y comportamientos.

---

## Comandos

### `aievaluator login`

Autentica al usuario con AI Evaluator.

| Flag | Tipo | Required | Default | Descripción |
|---|---|---|---|---|
| `--api-key` | string | No | — | API key (non-interactive mode) |
| `--engine-url` | string | No | `https://api.aievaluator.dev` | Engine API base URL |

**Comportamiento:**
- Sin `--api-key`: prompt interactivo pidiendo la key
- Guarda en `~/.config/aievaluator/config.json`
- Confirma con: "✅ Logged in as {tenant_name} ({tier})"
- Exit code: 0 si OK, 2 si falla

---

### `aievaluator whoami`

Muestra información del tenant autenticado. Sin flags.

**Comportamiento:**
- Lee API key de config
- Llama `GET /api/v1/tenants/me/usage`
- Muestra: Tenant, Tier, Evals, Tokens

---

### `aievaluator quick`

Evaluación rápida sin API key usando el playground.

| Flag | Tipo | Required | Default | Descripción |
|---|---|---|---|---|
| `[query]` | string | Condicional | — | Query individual (argumento posicional) |
| `--dataset` | path | Condicional | — | Archivo JSON o JSONL con queries |
| `--agent` | string | No | `/chat` | Agent endpoint URL |
| `--expected` | string | No | — | Expected output para query individual |
| `--metrics` | string | No | `faithfulness,g_eval` | Métricas: nombres solos o `name:threshold` |
| `--min-score` | float | No | — | Threshold general aplicado a todas las métricas |
| `--judge` | string | No | `deepseek` | LLM judge model |
| `--engine-url` | string | No | `https://api.aievaluator.dev` | Engine URL |

**Modos de usar `--metrics`:**
- `faithfulness,g_eval` — métricas sin threshold (usa defaults del engine)
- `faithfulness:0.90,g_eval:0.75` — cada métrica con su threshold individual
- Si se usa `--min-score 0.8` sin thresholds individuales, se aplica 0.8 a todas

**Comportamiento:**
- Sin API key — usa `POST /api/v1/playground/evaluate`
- ⚠️ Exactly uno de `[query]` o `--dataset`
- Acepta `.json` y `.jsonl`
- Si `--min-score` está seteado, exit code 1 si algún resultado no pasa

---

### `aievaluator eval`

Evaluación completa con API key contra un agente.

| Flag | Tipo | Required | Default | Descripción |
|---|---|---|---|---|
| `--agent` | string | ✅ | — | Agent endpoint URL |
| `--dataset` | path | Condicional | — | Archivo JSON/JSONL con test cases |
| `--rows` | JSON | Condicional | — | Inline JSON array de test cases |
| `--metrics` | string | No | `faithfulness,g_eval` | Métricas (comma-separated, acepta UUIDs) |
| `--agent-format` | string | No | `openai` | `openai`, `claude`, `custom` |
| `--min-score` | float | No | `0.0` | Overall threshold (0-1) |
| `--thresholds` | string | No | — | Per-metric: `faithfulness:0.90,g_eval:0.75` |
| `--custom` | JSON | No | — | Inline custom evaluator `{"name":"x","prompt":"...","threshold":0.8}` |
| `--format` | string | No | `table` | `table`, `json`, `junit` |
| `--ci` | flag | No | false | CI mode (no colors, no prompts) |
| `--timeout` | int | No | `300` | Timeout en segundos |
| `--judge-model` | string | No | `deepseek` | LLM judge model |
| `--name` | string | No | — | Nombre descriptivo para esta eval |
| `--api-key` | string | No | — | API key (overrides config) |
| `--engine-url` | string | No | — | Engine URL |

**Modos de threshold:**
- `--min-score 0.80` — el overall_score debe ≥ 0.80
- `--thresholds faithfulness:0.90,g_eval:0.75` — cada métrica con su threshold
- Ambos pueden combinarse: `--min-score 0.70 --thresholds faithfulness:0.90`

**Custom evaluators inline (CU3):**
- `--metrics my_eval --custom '{"name":"my_eval","prompt":"Is X true?","threshold":0.8}'`
- El custom se define en el request y se referencia por nombre en `--metrics`

---

### `aievaluator config`

| Subcomando | Descripción |
|---|---|
| `config show` | Muestra la configuración actual |
| `config set <key> <value>` | Setea un valor |
| `config unset <key>` | Borra un valor |

**Keys:** `engine-url`, `default-metrics`, `default-min-score`

---

### `aievaluator init`

Crea scaffolding en el directorio actual:
- `aievaluator.config.json` con defaults
- `evals/smoke-test.json` (dataset de ejemplo)
- Actualiza `.gitignore`

---

## Exit codes

| Code | Significado |
|:----:|-------------|
| 0 | OK — evaluación pasó el threshold |
| 1 | Score < min-score o algún result no pasó |
| 2 | Error de configuración |
| 3 | Error de red / engine no disponible |

---

## Variables de entorno

| Variable | Descripción |
|---|---|
| `AIEVALUATOR_API_KEY` | API key |
| `AIEVALUATOR_ENGINE_URL` | URL del engine |
