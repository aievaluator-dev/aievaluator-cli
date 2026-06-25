"""
Tests for AI Evaluator CLI — metrics parsing.

Covers: simple metrics, metrics with thresholds, min-score fallback,
empty/null handling, whitespace trimming.
"""

import pytest

from aievaluator.cli import _parse_quick_metrics


class TestParseSimpleMetrics:
    def test_parse_simple_metrics(self):
        """4.1: "faithfulness,g_eval" → ["faithfulness", "g_eval"]."""
        result = _parse_quick_metrics("faithfulness,g_eval")
        assert result == ["faithfulness", "g_eval"]

    def test_parse_single_metric(self):
        """4.1: Single metric without threshold."""
        result = _parse_quick_metrics("g_eval")
        assert result == ["g_eval"]


class TestParseMetricsWithThresholds:
    def test_parse_metrics_with_thresholds(self):
        """4.2: "faithfulness:0.90,g_eval:0.75" → dicts with thresholds."""
        result = _parse_quick_metrics("faithfulness:0.90,g_eval:0.75")
        assert result == [
            {"name": "faithfulness", "threshold": 0.90},
            {"name": "g_eval", "threshold": 0.75},
        ]

    def test_parse_mixed_metrics(self):
        """4.2: Mixed: some with threshold, some without (+ min_score fallback)."""
        result = _parse_quick_metrics("faithfulness:0.90,g_eval", default_threshold=0.8)
        assert result == [
            {"name": "faithfulness", "threshold": 0.90},
            {"name": "g_eval", "threshold": 0.8},
        ]


class TestParseMetricsWithMinScoreFallback:
    def test_parse_metrics_with_min_score_fallback(self):
        """4.3: "faithfulness,g_eval" + min_score=0.8 → all get threshold 0.8."""
        result = _parse_quick_metrics("faithfulness,g_eval", default_threshold=0.8)
        assert result == [
            {"name": "faithfulness", "threshold": 0.8},
            {"name": "g_eval", "threshold": 0.8},
        ]

    def test_no_min_score_no_fallback(self):
        """4.3: Without min_score, simple metrics stay as strings."""
        result = _parse_quick_metrics("faithfulness,g_eval")
        assert result == ["faithfulness", "g_eval"]


class TestParseEmptyMetrics:
    def test_parse_none(self):
        """4.4: None → None."""
        result = _parse_quick_metrics(None)
        assert result is None

    def test_parse_empty_string(self):
        """4.4: Empty string → None."""
        result = _parse_quick_metrics("")
        assert result is None


class TestParseWhitespaceHandling:
    def test_parse_whitespace_handling(self):
        """4.5: Trims whitespace around metric names."""
        result = _parse_quick_metrics(" faithfulness , g_eval ")
        assert result == ["faithfulness", "g_eval"]

    def test_parse_messy_input(self):
        """4.5: Handles extra spaces everywhere."""
        result = _parse_quick_metrics(
            "  faithfulness  :  0.90  ,  g_eval  :  0.75  ", default_threshold=0.5
        )
        assert result == [
            {"name": "faithfulness", "threshold": 0.90},
            {"name": "g_eval", "threshold": 0.75},
        ]
