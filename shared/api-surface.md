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
- Hace `GET /api/v1/tenants/me/usage` para obtener el tenant info
- Exit code: 0 si OK, 1 si falla

---

### `aievaluator whoami`

Muestra información del tenant autenticado.

**Sin flags.**

**Comportamiento:**
- Lee API key de config
- Llama `GET /api/v1/tenants/me/usage`
- Muestra:
  ```
  Tenant:  {name}
  Tier:    {tier}
  Evals:   {used}/{limit} this cycle
  Tokens:  ↓{input} · ↑{output} this cycle
  ```
- Exit code: 0

---

### `aievaluator quick`

Evaluación rápida sin API key usando el playground.

| Flag | Tipo | Required | Default | Descripción |
|---|---|---|---|---|
| `--query` | string | Condicional | — | Query individual |
| `--dataset` | path | Condicional | — | Archivo JSON con queries |
| `--expected` | string | No | — | Expected output para `--query` |
| `--metrics` | string | No | `faithfulness,g_eval` | Métricas (comma-separated) |
| `--judge` | string | No | `deepseek` | LLM judge model |

**Comportamiento:**
- ⚠️ Exactamente uno de `--query` o `--dataset`
- Sin API key — usa `POST /api/v1/playground/evaluate`
- Muestra remaining counter: "⚠️ Playground mode — {remaining}/5 remaining"
- Tabla de resultados con scores y pass/fail
- Exit code: 0

---

### `aievaluator eval`

Evaluación completa con API key contra un agente.

| Flag | Tipo | Required | Default | Descripción |
|---|---|---|---|---|
| `--agent` | string | ✅ | — | Agent endpoint URL |
| `--dataset` | path | Condicional | — | Archivo JSON con test cases |
| `--rows` | JSON | Condicional | — | Inline JSON array de test cases |
| `--metrics` | string | No | `faithfulness,g_eval` | Métricas (comma-separated) |
| `--agent-format` | string | No | `openai` | `openai`, `claude`, `custom` |
| `--min-score` | float | No | `0.0` | Threshold (0-1) |
| `--format` | string | No | `table` | `table`, `json`, `junit` |
| `--ci` | flag | No | false | CI mode (no colors, no prompts) |
| `--timeout` | int | No | `300` | Timeout en segundos |
| `--judge-model` | string | No | `deepseek` | LLM judge model |
| `--name` | string | No | — | Nombre descriptivo para esta eval |

**Comportamiento:**
- ⚠️ Exactamente uno de `--dataset` o `--rows`
- Requiere API key (flag, env var, o config file)
- Envía a `POST /api/v1/evaluations/sync` o `/sync/upload`
- Muestra resultados en formato table/json/junit según `--format`
- Exit code: 0 si `overall_score >= min_score`, 1 si no

---

### `aievaluator config`

Gestiona la configuración del CLI.

| Subcomando | Descripción |
|---|---|
| `config show` | Muestra la configuración actual |
| `config set <key> <value>` | Setea un valor |
| `config unset <key>` | Borra un valor |

**Keys válidas:**
- `engine-url` — URL base del engine
- `default-metrics` — Métricas por defecto (comma-separated)
- `default-min-score` — Threshold por defecto (0-1)

---

### `aievaluator init`

Crea scaffolding en el directorio actual.

**Sin flags.**

**Comportamiento:**
- Crea `aievaluator.config.json` con defaults
- Crea `evals/` con dataset de ejemplo `smoke-test.json`
- Agrega/appendea `.gitignore`
- Muestra next steps
- Exit code: 0

---

## Exit codes

| Code | Significado |
|:----:|-------------|
| 0 | OK — evaluación pasó el threshold |
| 1 | Evaluación completada pero score < min-score |
| 2 | Error de configuración (falta API key, archivo no encontrado, etc.) |
| 3 | Error de red / engine no disponible |

---

## Variables de entorno

| Variable | Descripción |
|---|---|
| `AIEVALUATOR_API_KEY` | API key (alternativa a `--api-key` o config file) |
| `AIEVALUATOR_ENGINE_URL` | URL del engine (default: `https://api.aievaluator.dev`) |
