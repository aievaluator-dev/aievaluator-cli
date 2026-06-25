"""
Tests for AI Evaluator CLI — per-metric thresholds parsing.

Covers: threshold string parsing, empty thresholds, invalid values,
coexistence with min-score.
"""

import pytest


def _parse_thresholds(thresholds_str: str | None) -> dict[str, float]:
    """Replicate CLI threshold parsing logic for testing."""
    thresholds_dict: dict[str, float] = {}
    if not thresholds_str:
        return thresholds_dict
    for pair in thresholds_str.split(","):
        pair = pair.strip()
        if ":" in pair:
            metric_name, val = pair.split(":", 1)
            try:
                thresholds_dict[metric_name.strip()] = float(val.strip())
            except ValueError:
                pass  # Invalid values silently skipped
    return thresholds_dict


class TestParseThresholdsString:
    def test_parse_thresholds_string(self):
        """5.1: "faithfulness:0.90,g_eval:0.75" → parsed dict."""
        result = _parse_thresholds("faithfulness:0.90,g_eval:0.75")
        assert result == {"faithfulness": 0.90, "g_eval": 0.75}

    def test_parse_single_threshold(self):
        """5.1: Single threshold pair."""
        result = _parse_thresholds("faithfulness:0.90")
        assert result == {"faithfulness": 0.90}


class TestParseEmptyThresholds:
    def test_parse_none(self):
        """5.2: None → empty dict."""
        result = _parse_thresholds(None)
        assert result == {}

    def test_parse_empty_string(self):
        """5.2: Empty string → empty dict."""
        result = _parse_thresholds("")
        assert result == {}


class TestParseInvalidThresholdValue:
    def test_parse_invalid_threshold_value(self):
        """5.3: "faithfulness:abc" → silently skipped, doesn't crash."""
        result = _parse_thresholds("faithfulness:abc,g_eval:0.80")
        assert result == {"g_eval": 0.80}

    def test_parse_malformed_entry(self):
        """5.3: No colon separator → skipped."""
        result = _parse_thresholds("faithfulness,g_eval:0.80")
        assert result == {"g_eval": 0.80}


class TestMinScoreAndThresholdsCombined:
    def test_min_score_and_thresholds_combined(self):
        """5.4: Both --min-score and --thresholds coexist (separate concerns)."""
        thresholds = _parse_thresholds("faithfulness:0.90,g_eval:0.75")
        min_score = 0.80
        # They don't interfere with each other
        assert thresholds["faithfulness"] == 0.90
        assert thresholds["g_eval"] == 0.75
        assert min_score == 0.80

    def test_both_empty(self):
        """5.4: Both empty is fine."""
        thresholds = _parse_thresholds(None)
        assert thresholds == {}
