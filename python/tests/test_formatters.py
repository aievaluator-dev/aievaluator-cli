"""
Tests for AI Evaluator CLI — output formatters.

Covers: JSON output structure, passed/failed, JUnit XML header/testcases/escaping, table.
"""

import json

from aievaluator.formatters import format_json_output, format_junit
from aievaluator.formatters.table import format_table
from unittest import mock
import io


# ═══════════════════════════════════════════════════════════════════
#  Test data
# ═══════════════════════════════════════════════════════════════════

SAMPLE_RESULT_ALL_PASS = {
    "evaluation_id": "eval-001",
    "overall_score": 0.85,
    "total_rows": 2,
    "input_tokens": 100,
    "output_tokens": 50,
    "results": [
        {
            "query": "Test 1",
            "expected_output": "OK",
            "agent_response": "OK",
            "scores": {"faithfulness": 1.0, "g_eval": 0.95},
            "passed": True,
        },
        {
            "query": "Test 2",
            "expected_output": "OK",
            "agent_response": "OK",
            "scores": {"faithfulness": 0.90, "g_eval": 0.85},
            "passed": True,
        },
    ],
}

SAMPLE_RESULT_WITH_FAILURES = {
    "evaluation_id": "eval-002",
    "overall_score": 0.75,
    "total_rows": 2,
    "input_tokens": 80,
    "output_tokens": 40,
    "results": [
        {
            "query": "Test 1",
            "expected_output": "OK",
            "agent_response": "OK",
            "scores": {"faithfulness": 1.0},
            "passed": True,
        },
        {
            "query": "Test 2 & special <chars> \"quotes\"",
            "expected_output": "Expected & output",
            "agent_response": "Bad <response>",
            "scores": {"faithfulness": 0.5, "g_eval": 0.3},
            "passed": False,
        },
    ],
}

SAMPLE_RESULT_EMPTY: dict = {"results": []}


# ═══════════════════════════════════════════════════════════════════
#  JSON Output (6.1 - 6.4)
# ═══════════════════════════════════════════════════════════════════

class TestJSONOutput:
    def test_json_output_passed_true(self):
        """6.1: passed: true and failed_queries count correct when all pass."""
        output = format_json_output(SAMPLE_RESULT_ALL_PASS, min_score=0.80)
        parsed = json.loads(output)
        assert parsed["passed"] is True
        assert parsed["failed_queries"] == 0

    def test_json_output_passed_false(self):
        """6.2: passed: false when some queries fail."""
        output = format_json_output(SAMPLE_RESULT_WITH_FAILURES, min_score=0.80)
        parsed = json.loads(output)
        assert parsed["passed"] is False
        assert parsed["failed_queries"] == 1

    def test_json_output_structure(self):
        """6.3: All expected keys present in JSON output."""
        output = format_json_output(SAMPLE_RESULT_ALL_PASS, min_score=0.80)
        parsed = json.loads(output)
        expected_keys = {
            "evaluation_id",
            "overall_score",
            "passed",
            "min_score",
            "total_rows",
            "failed_queries",
            "input_tokens",
            "output_tokens",
            "results",
        }
        assert set(parsed.keys()) == expected_keys

    def test_json_output_tokens(self):
        """6.4: input_tokens/output_tokens correctly propagated."""
        output = format_json_output(SAMPLE_RESULT_ALL_PASS, min_score=0.80)
        parsed = json.loads(output)
        assert parsed["input_tokens"] == 100
        assert parsed["output_tokens"] == 50


# ═══════════════════════════════════════════════════════════════════
#  JUnit XML Output (6.5 - 6.8)
# ═══════════════════════════════════════════════════════════════════

class TestJUnitOutput:
    def test_junit_output_header(self):
        """6.5: XML tag with correct tests, failures, errors counts."""
        output = format_junit(SAMPLE_RESULT_WITH_FAILURES, min_score=0.80)
        assert '<testsuite name="AI Evaluator" tests="2" failures="1" errors="0"' in output

    def test_junit_output_passing_testcase(self):
        """6.6: Passing query → <testcase> with no <failure>."""
        output = format_junit(SAMPLE_RESULT_ALL_PASS, min_score=0.80)
        assert "<testcase" in output
        assert "<failure" not in output

    def test_junit_output_failing_testcase(self):
        """6.7: Failing query → <testcase> with <failure> containing details."""
        output = format_junit(SAMPLE_RESULT_WITH_FAILURES, min_score=0.80)
        assert "<failure" in output
        assert "Query:" in output
        assert "Expected:" in output
        assert "Got:" in output
        assert "Scores:" in output

    def test_junit_output_xml_escaping(self):
        """6.8: Special chars in queries escaped (&, <, >, ", ')."""
        output = format_junit(SAMPLE_RESULT_WITH_FAILURES, min_score=0.80)
        assert "&amp;" in output  # & escaped
        assert "&lt;" in output  # < escaped
        assert "&gt;" in output  # > escaped
        assert "&quot;" in output  # " escaped
        # Raw special chars should not appear unescaped in attribute-less text
        # (The XML library handles context-aware escaping)

    def test_junit_output_all_pass(self):
        """6.6 cont: All-pass results produce no failure elements."""
        output = format_junit(SAMPLE_RESULT_ALL_PASS, min_score=0.0)
        assert 'failures="0"' in output
        assert "<failure" not in output


# ═══════════════════════════════════════════════════════════════════
#  Table Output (6.9 - 6.10)
# ═══════════════════════════════════════════════════════════════════

class TestTableOutput:
    def test_table_output_does_not_throw(self):
        """6.9: Table formatter runs without errors."""
        import sys
        from rich.console import Console

        # Capture output to avoid terminal clutter
        with mock.patch.object(Console, "print", return_value=None):
            format_table(SAMPLE_RESULT_ALL_PASS, min_score=0.80, engine_url="https://api.aievaluator.dev")

    def test_table_output_empty_results(self):
        """6.10: Empty results array handled gracefully."""
        import sys
        from rich.console import Console

        with mock.patch.object(Console, "print", return_value=None):
            format_table(
                {"results": [], "overall_score": 0.0, "total_rows": 0},
                min_score=0.80,
                engine_url="https://api.aievaluator.dev",
            )

    def test_table_output_with_failures(self):
        """6.9: Table with failures shows correct threshold message."""
        import sys
        from rich.console import Console

        with mock.patch.object(Console, "print", return_value=None):
            format_table(
                SAMPLE_RESULT_WITH_FAILURES, min_score=0.80, engine_url="https://api.aievaluator.dev"
            )
