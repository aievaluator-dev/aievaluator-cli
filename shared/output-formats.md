# Output Formats — AI Evaluator CLI

> Specification of the 3 output formats. All clients must produce
> identical outputs in each format.

---

## 1. Table (default)

Human-readable terminal format. Uses each language's table library
(rich for Python, lipgloss for Go, Spectre.Console for C#, chalk for Node).

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

Each result row with:
- Query number
- Query truncated to 50 chars
- First metric score as percentage
- ✅ if passed, ❌ if not

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
or
```
❌ Score 72.0% below threshold 0.80
```

---

## 2. JSON (`--format json`)

Clean stdout output. JSON only, no logs or colors.

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

### Rules
- stdout: JSON only
- stderr: warnings/errors (empty if all OK)
- Exit code: 0 if `passed == true`, 1 otherwise

---

## 3. JUnit XML (`--format junit`)

Compatible with Jenkins, GitLab CI, GitHub Actions, CircleCI.

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

### Rules
- `<testsuite>`: `tests` = total queries, `failures` = failed queries
- `<testcase>`: one per query. `name` = "Query {N}: {truncated query}"
- `<failure>`: only if `passed == false`. Includes query, expected, got, scores
- `time` in `<testcase>` is optional (0 if no per-query latency)
