"""
Tests for AI Evaluator CLI — exit codes.

Covers: exit code 0 (success), 1 (score below / row failed),
2 (config error), 3 (connection error).
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
from aievaluator.api.client import APIError


@pytest.fixture
def runner():
    return CliRunner()


class TestExitCodes:
    def test_exit_code_0(self, runner):
        """13.1: Successful eval → exit code 0."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump([{"input": "ok"}], f)
            path = f.name

        try:
            with (
                mock.patch("aievaluator.cli.resolve_api_key", return_value="sk-test"),
                mock.patch("aievaluator.cli.APIClient") as MockClient,
            ):
                mock_client = MockClient.return_value
                mock_client.evaluate_sync = AsyncMock(return_value={
                    "evaluation_id": "test",
                    "overall_score": 0.95,
                    "total_rows": 1,
                    "results": [{"passed": True, "query": "ok", "scores": {"faithfulness": 0.95}}],
                })
                result = runner.invoke(
                    main,
                    ["eval", "--agent", "https://agent.com/chat", "--dataset", path],
                )
                assert result.exit_code == 0
        finally:
            os.unlink(path)

    def test_exit_code_1_score_below(self, runner):
        """13.2: Score below min-score → exit code 1."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump([{"input": "test"}], f)
            path = f.name

        try:
            with (
                mock.patch("aievaluator.cli.resolve_api_key", return_value="sk-test"),
                mock.patch("aievaluator.cli.APIClient") as MockClient,
            ):
                mock_client = MockClient.return_value
                mock_client.evaluate_sync = AsyncMock(return_value={
                    "evaluation_id": "test",
                    "overall_score": 0.55,
                    "total_rows": 1,
                    "results": [{"passed": True, "query": "ok", "scores": {"faithfulness": 0.55}}],
                })
                result = runner.invoke(
                    main,
                    ["eval", "--agent", "https://agent.com/chat", "--dataset", path, "--min-score", "0.80"],
                )
                assert result.exit_code == 1
        finally:
            os.unlink(path)

    def test_exit_code_1_any_row_failed(self, runner):
        """13.3: Any row failed → exit code 1 (via quick --min-score)."""
        with mock.patch("aievaluator.cli.APIClient") as MockClient:
            mock_client = MockClient.return_value
            mock_client.playground_status = AsyncMock(
                return_value={"remaining": 5, "limit": 5, "resets_at": "midnight"}
            )
            mock_client.playground_evaluate = AsyncMock(return_value={
                "results": [{"passed": False, "scores": {"faithfulness": 0.3}}],
            })

            result = runner.invoke(
                main, ["quick", "failing query", "--min-score", "0.80"]
            )
            assert result.exit_code == 1

    def test_exit_code_2_config_error(self, runner):
        """13.4: Invalid config/args → exit code 2."""
        result = runner.invoke(main, ["eval"])
        assert result.exit_code == 2

    def test_exit_code_3_connection_error(self, runner):
        """13.5: Cannot connect → exit code 3."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump([{"input": "test"}], f)
            path = f.name

        try:
            with (
                mock.patch("aievaluator.cli.resolve_api_key", return_value="sk-test"),
                mock.patch("aievaluator.cli.APIClient") as MockClient,
            ):
                mock_client = MockClient.return_value
                mock_client.evaluate_sync = AsyncMock(
                    side_effect=APIError(0, "Cannot connect to https://api.aievaluator.dev")
                )
                result = runner.invoke(
                    main,
                    ["eval", "--agent", "https://agent.com/chat", "--dataset", path],
                )
                assert result.exit_code == 3
        finally:
            os.unlink(path)
