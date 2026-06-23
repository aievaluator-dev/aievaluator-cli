"""Tests for AI Evaluator CLI formatters."""

from aievaluator.formatters import format_json_output, format_junit


def test_format_json_output():
    data = {
        "evaluation_id": "test-uuid",
        "overall_score": 0.85,
        "total_rows": 2,
        "input_tokens": 100,
        "output_tokens": 50,
        "results": [
            {"query": "Test 1", "expected_output": "OK", "agent_response": "OK", "scores": {"faithfulness": 1.0}, "passed": True},
            {"query": "Test 2", "expected_output": "OK", "agent_response": "NOK", "scores": {"faithfulness": 0.7}, "passed": False},
        ],
    }
    output = format_json_output(data, min_score=0.80)
    parsed = __import__("json").loads(output)
    assert parsed["overall_score"] == 0.85
    assert parsed["passed"] is True
    assert parsed["total_rows"] == 2
    assert parsed["failed_queries"] == 1


def test_format_junit_output():
    data = {
        "evaluation_id": "test-uuid",
        "overall_score": 0.75,
        "total_rows": 2,
        "results": [
            {"query": "Test 1", "expected_output": "OK", "agent_response": "OK", "scores": {"faithfulness": 1.0}, "passed": True},
            {"query": "Test 2", "expected_output": "OK", "agent_response": "NOK", "scores": {"faithfulness": 0.5}, "passed": False},
        ],
    }
    output = format_junit(data, min_score=0.80)
    assert '<?xml version="1.0"' in output
    assert 'tests="2"' in output
    assert 'failures="1"' in output
    assert "Test 1" in output
    assert "Test 2" in output
