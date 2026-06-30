# Config Spec — AI Evaluator CLI

> Configuration and API key resolution specification.
> All clients must implement this behavior.

---

## Configuration file

### Path

| OS | Path |
|---|---|
| Linux | `~/.config/aievaluator/config.json` |
| macOS | `~/Library/Application Support/aievaluator/config.json` |
| Windows | `%APPDATA%\aievaluator\config.json` |

### Project-local override

If `./aievaluator.config.json` exists in the current directory, its values
override the global config. Ideal for CI/CD.

### Schema

```json
{
  "engine_url": "https://api.aievaluator.dev",
  "api_key": null,
  "default_metrics": "faithfulness,g_eval",
  "default_min_score": 0.80
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `engine_url` | string | `https://api.aievaluator.dev` | Engine base URL |
| `api_key` | string\|null | `null` | API key (optional in config, set by `login`) |
| `default_metrics` | string | `faithfulness,g_eval` | Default metrics |
| `default_min_score` | float | `0.80` | Default threshold |

---

## API key resolution priority

Priority order, highest to lowest:

1. **`--api-key` flag** — passed directly on the CLI
2. **`AIEVALUATOR_API_KEY` env var** — ideal for CI/CD
3. **Project-local config `./aievaluator.config.json`** — `api_key` field
4. **Global config `~/.config/aievaluator/config.json`** — `api_key` field

Same for `engine_url`:
1. `--engine-url` flag
2. `AIEVALUATOR_ENGINE_URL` env var
3. Project-local config `./aievaluator.config.json` → `engine_url`
4. Global config `~/.config/aievaluator/config.json` → `engine_url`
5. Default: `https://api.aievaluator.dev`

---

## `aievaluator login`

When running `aievaluator login`:

1. If `--api-key` was passed, uses it directly
2. Otherwise, interactive prompt:
   ```
   Enter your AI Evaluator API key:
   (Get one at https://aievaluator.dev/settings)
   ```
3. Validates the key by calling `GET /api/v1/tenants/me/usage`
4. If valid, saves to global config and displays:
   ```
   ✅ Logged in as {tenant_name} ({tier})
      Evals this cycle: {used}/{limit}
   ```
5. If invalid, error and exit code 2

---

## `aievaluator whoami`

1. Resolves API key by priority
2. If no key: error "Not logged in. Run `aievaluator login`"
3. Calls `GET /api/v1/tenants/me/usage`
4. Displays tenant info

---

## Recognized environment variables

| Variable | Equivalent to |
|---|---|
| `AIEVALUATOR_API_KEY` | `--api-key` flag |
| `AIEVALUATOR_ENGINE_URL` | `--engine-url` flag |
