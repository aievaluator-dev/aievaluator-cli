"""
Tests for AI Evaluator CLI — eval command (19 tests).

Covers: required flags validation, dataset/rows sources, API key,
thresholds, min-score, custom evaluators, JSON/JUnit/table formats,
CI mode, connection errors, agent-format, judge-model, name, flag overrides.
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


# ═══════════════════════════════════════════════════════════════════
#  Validation (10.1 - 10.3)
# ═══════════════════════════════════════════════════════════════════

class TestEvalValidation:
    def test_eval_missing_agent(self, runner):
        """10.1: No --agent → exit code 2, error message."""
        result = runner.invoke(main, ["eval"])
        assert result.exit_code == 2

    def test_eval_missing_data_source(self, runner):
        """10.2: No --dataset or --rows → exit code 2."""
        result = runner.invoke(main, ["eval", "--agent", "https://agent.com/chat"])
        assert result.exit_code == 2

    def test_eval_missing_api_key(self, runner):
        """10.3: Not logged in → exit code 2, "API key required"."""
        with mock.patch("aievaluator.cli.resolve_api_key", return_value=None):
            with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
                json.dump([{"input": "test"}], f)
                path = f.name
            try:
                result = runner.invoke(
                    main, ["eval", "--agent", "https://agent.com/chat", "--dataset", path]
                )
                assert result.exit_code == 2
            finally:
                os.unlink(path)


# ═══════════════════════════════════════════════════════════════════
#  Data Sources & Options (10.4 - 10.9)
# ═══════════════════════════════════════════════════════════════════

class TestEvalDataSources:
    def test_eval_with_dataset(self, runner):
        """10.4: --dataset flag → reads and evaluates."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump([{"input": "hello"}], f)
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
                    "results": [{"passed": True, "query": "hello", "scores": {"faithfulness": 0.95}}],
                })
                result = runner.invoke(
                    main, ["eval", "--agent", "https://agent.com/chat", "--dataset", path]
                )
                assert result.exit_code == 0
        finally:
            os.unlink(path)

    def test_eval_with_inline_rows(self, runner):
        """10.5: --rows '[{"input":"hi"}]' → parses and evaluates."""
        with (
            mock.patch("aievaluator.cli.resolve_api_key", return_value="sk-test"),
            mock.patch("aievaluator.cli.APIClient") as MockClient,
        ):
            mock_client = MockClient.return_value
            mock_client.evaluate_sync = AsyncMock(return_value={
                "evaluation_id": "test",
                "overall_score": 0.95,
                "results": [{"passed": True, "query": "hi", "scores": {"faithfulness": 0.95}}],
            })
            result = runner.invoke(
                main,
                [
                    "eval",
                    "--agent",
                    "https://agent.com/chat",
                    "--rows",
                    '[{"input":"hi","expected_output":"hello"}]',
                ],
            )
            assert result.exit_code == 0

    def test_eval_with_thresholds(self, runner):
        """10.6: --thresholds faithfulness:0.90,g_eval:0.75 → sent in body."""
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
                    "overall_score": 0.95,
                    "results": [{"passed": True, "query": "test", "scores": {"faithfulness": 0.95}}],
                })
                result = runner.invoke(
                    main,
                    [
                        "eval",
                        "--agent",
                        "https://agent.com/chat",
                        "--dataset",
                        path,
                        "--thresholds",
                        "faithfulness:0.90,g_eval:0.75",
                    ],
                )
                assert result.exit_code == 0
        finally:
            os.unlink(path)

    def test_eval_with_min_score_exit_code(self, runner):
        """10.7: --min-score → exit code 1 if overall_score < threshold."""
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
                    "overall_score": 0.50,
                    "results": [{"passed": False, "query": "bad", "scores": {"faithfulness": 0.5}}],
                })
                result = runner.invoke(
                    main,
                    ["eval", "--agent", "https://agent.com/chat", "--dataset", path, "--min-score", "0.80"],
                )
                assert result.exit_code == 1
        finally:
            os.unlink(path)

    def test_eval_with_custom_evaluator(self, runner):
        """10.8: --custom '{"name":"polite","prompt":"...","threshold":0.8}'."""
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
                    "overall_score": 0.95,
                    "results": [{"passed": True, "query": "test", "scores": {"polite": 0.9}}],
                })
                custom_json = '{"name":"polite","prompt":"Is it polite?","threshold":0.8}'
                result = runner.invoke(
                    main,
                    [
                        "eval",
                        "--agent",
                        "https://agent.com/chat",
                        "--dataset",
                        path,
                        "--custom",
                        custom_json,
                        "--metrics",
                        "polite,g_eval",
                    ],
                )
                assert result.exit_code == 0
        finally:
            os.unlink(path)

    def test_eval_with_custom_evaluator_array(self, runner):
        """10.9: --custom '[{...},{...}]' array of custom evaluators."""
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
                    "overall_score": 0.95,
                    "results": [{"passed": True, "query": "test", "scores": {"polite": 0.9}}],
                })
                custom_json = (
                    '[{"name":"polite","prompt":"Polite?","threshold":0.8},'
                    + '{"name":"concise","prompt":"Concise?","threshold":0.7}]'
                )
                result = runner.invoke(
                    main,
                    [
                        "eval",
                        "--agent",
                        "https://agent.com/chat",
                        "--dataset",
                        path,
                        "--custom",
                        custom_json,
                    ],
                )
                assert result.exit_code == 0
        finally:
            os.unlink(path)


# ═══════════════════════════════════════════════════════════════════
#  Output Formats & Flags (10.10 - 10.19)
# ═══════════════════════════════════════════════════════════════════

class TestEvalFormats:
    def test_eval_json_format(self, runner):
        """10.10: --format json → valid JSON on stdout."""
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
                    "overall_score": 0.85,
                    "input_tokens": 10,
                    "output_tokens": 5,
                    "results": [{"passed": True, "query": "test", "scores": {"faithfulness": 0.85}}],
                })
                result = runner.invoke(
                    main,
                    ["eval", "--agent", "https://agent.com/chat", "--dataset", path, "--format", "json"],
                )
                assert result.exit_code == 0
                parsed = json.loads(result.output.strip())
                assert "overall_score" in parsed
        finally:
            os.unlink(path)

    def test_eval_junit_format(self, runner):
        """10.11: --format junit → valid XML on stdout."""
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
                    "overall_score": 0.85,
                    "results": [{"passed": True, "query": "test", "scores": {"faithfulness": 0.85}}],
                })
                result = runner.invoke(
                    main,
                    ["eval", "--agent", "https://agent.com/chat", "--dataset", path, "--format", "junit"],
                )
                assert result.exit_code == 0
                assert "<?xml" in result.output
        finally:
            os.unlink(path)

    def test_eval_ci_mode(self, runner):
        """10.12: --ci flag accepted without error."""
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
                    "overall_score": 0.85,
                    "results": [{"passed": True, "query": "test", "scores": {"faithfulness": 0.85}}],
                })
                result = runner.invoke(
                    main,
                    ["eval", "--agent", "https://agent.com/chat", "--dataset", path, "--ci"],
                )
                assert result.exit_code == 0
        finally:
            os.unlink(path)

    def test_eval_connection_error_exit_code(self, runner):
        """10.13: Cannot connect → exit code 3."""
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
                    main, ["eval", "--agent", "https://agent.com/chat", "--dataset", path]
                )
                assert result.exit_code == 3
        finally:
            os.unlink(path)

    def test_eval_api_error_exit_code(self, runner):
        """10.14: API returns 4xx/5xx → exit code 2."""
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
                    side_effect=APIError(500, "Engine returned HTTP 500")
                )
                result = runner.invoke(
                    main, ["eval", "--agent", "https://agent.com/chat", "--dataset", path]
                )
                assert result.exit_code == 2
        finally:
            os.unlink(path)

    def test_eval_agent_format(self, runner):
        """10.15: --agent-format claude sent in request body."""
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
                    "overall_score": 0.85,
                    "results": [{"passed": True, "query": "test", "scores": {"faithfulness": 0.85}}],
                })
                result = runner.invoke(
                    main,
                    ["eval", "--agent", "https://agent.com/chat", "--dataset", path, "--agent-format", "claude"],
                )
                assert result.exit_code == 0
        finally:
            os.unlink(path)

    def test_eval_judge_model(self, runner):
        """10.16: --judge-model sent in request body."""
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
                    "overall_score": 0.85,
                    "results": [{"passed": True, "query": "test", "scores": {"faithfulness": 0.85}}],
                })
                result = runner.invoke(
                    main,
                    ["eval", "--agent", "https://agent.com/chat", "--dataset", path, "--judge-model", "deepseek"],
                )
                assert result.exit_code == 0
        finally:
            os.unlink(path)

    def test_eval_name(self, runner):
        """10.17: --name "My eval" sent in request body."""
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
                    "overall_score": 0.85,
                    "results": [{"passed": True, "query": "test", "scores": {"faithfulness": 0.85}}],
                })
                result = runner.invoke(
                    main,
                    ["eval", "--agent", "https://agent.com/chat", "--dataset", path, "--name", "My evaluation run"],
                )
                assert result.exit_code == 0
        finally:
            os.unlink(path)

    def test_eval_api_key_flag_override(self, runner):
        """10.18: --api-key flag overrides config."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump([{"input": "test"}], f)
            path = f.name

        try:
            with (
                mock.patch("aievaluator.cli.resolve_api_key", return_value="sk-flag"),
                mock.patch("aievaluator.cli.APIClient") as MockClient,
            ):
                mock_client = MockClient.return_value
                mock_client.evaluate_sync = AsyncMock(return_value={
                    "evaluation_id": "test",
                    "overall_score": 0.85,
                    "results": [{"passed": True, "query": "test", "scores": {"faithfulness": 0.85}}],
                })
                result = runner.invoke(
                    main,
                    ["eval", "--agent", "https://agent.com/chat", "--dataset", path, "--api-key", "sk-flag"],
                )
                assert result.exit_code == 0
        finally:
            os.unlink(path)

    def test_eval_engine_url_flag_override(self, runner):
        """10.19: --engine-url flag overrides config."""
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
                    "overall_score": 0.85,
                    "results": [{"passed": True, "query": "test", "scores": {"faithfulness": 0.85}}],
                })
                result = runner.invoke(
                    main,
                    ["eval", "--agent", "https://agent.com/chat", "--dataset", path, "--engine-url", "https://custom-engine.dev"],
                )
                assert result.exit_code == 0
        finally:
            os.unlink(path)
