# Config Spec — AI Evaluator CLI

> Especificación de configuración y resolución de API key.
> Todos los clientes deben implementar este comportamiento.

---

## Archivo de configuración

### Path

| OS | Path |
|---|---|
| Linux | `~/.config/aievaluator/config.json` |
| macOS | `~/Library/Application Support/aievaluator/config.json` |
| Windows | `%APPDATA%\aievaluator\config.json` |

### Project-local override

Si existe `./aievaluator.config.json` en el directorio actual, sus valores
sobreescriben los del config global. Ideal para CI/CD.

### Esquema

```json
{
  "engine_url": "https://api.aievaluator.dev",
  "api_key": null,
  "default_metrics": "faithfulness,g_eval",
  "default_min_score": 0.80
}
```

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `engine_url` | string | `https://api.aievaluator.dev` | Base URL del engine |
| `api_key` | string\|null | `null` | API key (opcional en config, seteado por `login`) |
| `default_metrics` | string | `faithfulness,g_eval` | Métricas por defecto |
| `default_min_score` | float | `0.80` | Threshold por defecto |

---

## Prioridad de resolución de API key

El orden de prioridad, de mayor a menor:

1. **Flag `--api-key`** — pasado directamente en la CLI
2. **Variable de entorno `AIEVALUATOR_API_KEY`** — ideal para CI/CD
3. **Project-local config `./aievaluator.config.json`** — `api_key` campo
4. **Global config `~/.config/aievaluator/config.json`** — `api_key` campo

Idem para `engine_url`:
1. Flag `--engine-url`
2. Variable de entorno `AIEVALUATOR_ENGINE_URL`
3. Project-local config `./aievaluator.config.json` → `engine_url`
4. Global config `~/.config/aievaluator/config.json` → `engine_url`
5. Default: `https://api.aievaluator.dev`

---

## `aievaluator login`

Al ejecutar `aievaluator login`:

1. Si se pasó `--api-key`, la usa directamente
2. Si no, prompt interactivo:
   ```
   Enter your AI Evaluator API key:
   (Get one at https://aievaluator.dev/settings)
   ```
3. Valida la key llamando `GET /api/v1/tenants/me/usage`
4. Si es válida, guarda en global config y muestra:
   ```
   ✅ Logged in as {tenant_name} ({tier})
      Evals this cycle: {used}/{limit}
   ```
5. Si es inválida, error y exit code 2

---

## `aievaluator whoami`

1. Resuelve API key según prioridad
2. Si no hay key: error "Not logged in. Run `aievaluator login`"
3. Llama `GET /api/v1/tenants/me/usage`
4. Muestra tenant info

---

## Variables de entorno reconocidas

| Variable | Equivalente a |
|---|---|
| `AIEVALUATOR_API_KEY` | `--api-key` flag |
| `AIEVALUATOR_ENGINE_URL` | `--engine-url` flag |
