"""JSON formatter."""

import json as json_mod


def format_json_output(data: dict, min_score: float = 0.0) -> str:
    """Return evaluation results as a JSON string."""
    results = data.get("results", [])
    overall_score = data.get("overall_score", 0)
    total_rows = data.get("total_rows", len(results))
    failed = sum(1 for r in results if not r.get("passed", True))
    input_tokens = data.get("input_tokens", 0)
    output_tokens = data.get("output_tokens", 0)
    eval_id = data.get("evaluation_id", "")

    output = {
        "evaluation_id": eval_id,
        "overall_score": overall_score,
        "passed": overall_score >= min_score,
        "min_score": min_score,
        "total_rows": total_rows,
        "failed_queries": failed,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "results": results,
    }

    return json_mod.dumps(output, indent=2)
