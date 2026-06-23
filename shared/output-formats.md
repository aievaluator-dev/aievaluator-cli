# Output Formats — AI Evaluator CLI

> Especificación de los 3 formatos de salida. Todos los clientes deben producir
> outputs idénticos en cada formato.

---

## 1. Table (default)

Formato para terminal humana. Usa la biblioteca de tablas del lenguaje
(rich para Python, lipgloss para Go, Spectre.Console para C#, chalk para Node).

### Header

```
┌──────────────────────────────────────────────────────────┐
│  AI Evaluator — Results                                  │
├──────────────────────────────────────────────────────────┤
│  Overall Score:  87.5%  ✅ above threshold (80%)        │
│  Total rows:     8                                       │
│  Failed:         1                                       │
│  Tokens:         ↓4,200 · ↑1,800                         │
├────┬────────────────────────────────────┬────────┬───────┤
│  # │ Query                              │ Score  │ Pass  │
├────┼────────────────────────────────────┼────────┼───────┤
```

### Rows

Cada fila de resultado con:
- Número de query
- Query truncada a 50 chars
- Score del primer métrico como porcentaje
- ✅ si passed, ❌ si no

```
│  1 │ What is 2+2?                       │  95%   │  ✅   │
│  2 │ Capital of France?                 │  90%   │  ✅   │
│  3 │ Explain quantum computing          │  72%   │  ❌   │
```

### Footer

```
└────┴────────────────────────────────────┴────────┴───────┘
```

### Threshold result

```
✅ Score 87.5% meets threshold 0.80
```
o
```
❌ Score 72.0% below threshold 0.80
```

---

## 2. JSON (`--format json`)

Salida limpia en stdout. Solo JSON, sin logs ni colores.

```json
{
  "evaluation_id": "uuid-here",
  "overall_score": 0.875,
  "passed": true,
  "min_score": 0.80,
  "total_rows": 8,
  "failed_queries": 1,
  "input_tokens": 4200,
  "output_tokens": 1800,
  "results": [
    {
      "query": "What is 2+2?",
      "expected_output": "4",
      "agent_response": "4",
      "scores": {
        "faithfulness": 1.0,
        "g_eval": 0.95
      },
      "passed": true
    }
  ]
}
```

### Reglas
- stdout: solo el JSON
- stderr: warnings/errores (vacío si todo OK)
- Exit code: 0 si `passed == true`, 1 si no

---

## 3. JUnit XML (`--format junit`)

Compatible con Jenkins, GitLab CI, GitHub Actions, CircleCI.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="AI Evaluator" tests="8" failures="1" errors="0" time="12.5">
  <testcase classname="AI Evaluator" name="Query 1: What is 2+2?" time="1.2">
  </testcase>
  <testcase classname="AI Evaluator" name="Query 2: Capital of France?" time="1.1">
  </testcase>
  <testcase classname="AI Evaluator" name="Query 3: Explain quantum computing" time="1.8">
    <failure message="Score 0.72 below threshold 0.80">
      Query: Explain quantum computing
      Expected: A clear explanation of quantum computing principles
      Got: Quantum computing is hard...
      Scores: {"faithfulness": 0.72}
    </failure>
  </testcase>
</testsuite>
```

### Reglas
- `<testsuite>`: `tests` = total queries, `failures` = queries que no pasaron
- `<testcase>`: uno por query. `name` = "Query {N}: {truncated query}"
- `<failure>`: solo si `passed == false`. Incluye query, expected, got, scores
- `time` en `<testcase>` es opcional (0 si no hay latencia por query)
