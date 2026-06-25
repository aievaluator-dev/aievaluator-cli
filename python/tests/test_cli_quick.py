"""
Tests for AI Evaluator CLI — quick command.

Covers: no query/dataset, single query, expected output, JSON/JSONL datasets,
metrics with thresholds, min-score, playground exhausted, exit codes.
"""

import json
import tempfile
import os
from pathlib import Path
from unittest import mock
from unittest.mock import AsyncMock

import pytest
from click.testing import CliRunner

from aievaluator.cli import main


@pytest.fixture
def runner():
    return CliRunner()


@pytest.fixture
def mock_status():
    return {"used": 1, "limit": 5, "remaining": 4, "resets_at": "midnight UTC"}


@pytest.fixture
def mock_quick_result():
    return {
        "results": [
            {
                "query": "What is 2+2?",
                "expected_output": "4",
                "agent_response": "4",
                "scores": {"faithfulness": 1.0},
                "passed": True,
            }
        ],
        "overall_score": 1.0,
        "total_rows": 1,
        "input_tokens": 50,
        "output_tokens": 10,
    }


class TestQuick:
    def test_quick_no_query_no_dataset(self, runner):
        """9.1: Neither provided → exit code 2, error message."""
        result = runner.invoke(main, ["quick"])
        assert result.exit_code == 2

    def test_quick_single_query(self, runner, mock_status, mock_quick_result):
        """9.2: Query argument → calls playground with single row."""
        with mock.patch("aievaluator.cli.APIClient") as MockClient:
            mock_client = MockClient.return_value
            mock_client.playground_status = AsyncMock(return_value=mock_status)
            mock_client.playground_evaluate = AsyncMock(return_value=mock_quick_result)

            result = runner.invoke(main, ["quick", "What is 2+2?"])
            assert result.exit_code == 0
            mock_client.playground_evaluate.assert_called_once()

    def test_quick_with_expected_output(self, runner, mock_status, mock_quick_result):
        """9.3: --expected flag adds expected_output to row."""
        with mock.patch("aievaluator.cli.APIClient") as MockClient:
            mock_client = MockClient.return_value
            mock_client.playground_status = AsyncMock(return_value=mock_status)
            mock_client.playground_evaluate = AsyncMock(return_value=mock_quick_result)

            result = runner.invoke(main, ["quick", "hi", "--expected", "hello"])
            assert result.exit_code == 0

    def test_quick_with_dataset_json(self, runner, mock_status):
        """9.4: --dataset flag → reads and sends rows."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(
                [
                    {"input": "Q1", "expected_output": "A1"},
                    {"input": "Q2", "expected_output": "A2"},
                ],
                f,
            )
            path = f.name

        try:
            with mock.patch("aievaluator.cli.APIClient") as MockClient:
                mock_client = MockClient.return_value
                mock_client.playground_status = AsyncMock(return_value=mock_status)
                mock_client.playground_evaluate = AsyncMock(
                    return_value={
                        "results": [{"passed": True}, {"passed": True}],
                        "overall_score": 0.95,
                    }
                )

                result = runner.invoke(main, ["quick", "--dataset", path])
                assert result.exit_code == 0
        finally:
            os.unlink(path)

    def test_quick_with_dataset_jsonl(self, runner, mock_status):
        """9.5: --dataset with .jsonl → reads line-by-line."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as f:
            f.write('{"input": "Q1"}\n{"input": "Q2"}\n')
            path = f.name

        try:
            with mock.patch("aievaluator.cli.APIClient") as MockClient:
                mock_client = MockClient.return_value
                mock_client.playground_status = AsyncMock(return_value=mock_status)
                mock_client.playground_evaluate = AsyncMock(
                    return_value={
                        "results": [{"passed": True}, {"passed": True}],
                        "overall_score": 0.95,
                    }
                )

                result = runner.invoke(main, ["quick", "--dataset", path])
                assert result.exit_code == 0
        finally:
            os.unlink(path)

    def test_quick_with_metrics_thresholds(self, runner, mock_status, mock_quick_result):
        """9.6: --metrics faithfulness:0.90,g_eval:0.75 parsed correctly."""
        with mock.patch("aievaluator.cli.APIClient") as MockClient:
            mock_client = MockClient.return_value
            mock_client.playground_status = AsyncMock(return_value=mock_status)
            mock_client.playground_evaluate = AsyncMock(return_value=mock_quick_result)

            result = runner.invoke(
                main,
                ["quick", "test query", "--metrics", "faithfulness:0.90,g_eval:0.75"],
            )
            assert result.exit_code == 0

    def test_quick_with_min_score(self, runner, mock_status, mock_quick_result):
        """9.7: --min-score 0.80 applied as threshold to all metrics."""
        with mock.patch("aievaluator.cli.APIClient") as MockClient:
            mock_client = MockClient.return_value
            mock_client.playground_status = AsyncMock(return_value=mock_status)
            mock_client.playground_evaluate = AsyncMock(return_value=mock_quick_result)

            result = runner.invoke(
                main,
                ["quick", "test query", "--min-score", "0.80"],
            )
            assert result.exit_code == 0

    def test_quick_playground_exhausted(self, runner):
        """9.8: Remaining=0 → exit code 2, "limit reached" message."""
        with mock.patch("aievaluator.cli.APIClient") as MockClient:
            mock_client = MockClient.return_value
            mock_client.playground_status = AsyncMock(
                return_value={
                    "remaining": 0,
                    "limit": 5,
                    "resets_at": "midnight UTC",
                }
            )

            result = runner.invoke(main, ["quick", "test"])
            assert result.exit_code == 2

    def test_quick_min_score_exit_code(self, runner, mock_status):
        """9.9: Score below min-score → exit code 1."""
        with mock.patch("aievaluator.cli.APIClient") as MockClient:
            mock_client = MockClient.return_value
            mock_client.playground_status = AsyncMock(return_value=mock_status)
            mock_client.playground_evaluate = AsyncMock(
                return_value={
                    "results": [{"passed": False}],
                    "overall_score": 0.50,
                }
            )

            result = runner.invoke(
                main,
                ["quick", "bad query", "--min-score", "0.80"],
            )
            assert result.exit_code == 1
