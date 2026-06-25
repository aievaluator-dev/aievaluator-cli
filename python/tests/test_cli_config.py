"""
Tests for AI Evaluator CLI — config command.

Covers: show, set valid/invalid keys, min-score type validation, unset.
"""

import json
from unittest import mock

import pytest
from click.testing import CliRunner

from aievaluator.cli import main


@pytest.fixture
def runner():
    return CliRunner()


@pytest.fixture
def mock_config_data():
    return {
        "api_key": "sk-test",
        "engine_url": "https://api.aievaluator.dev",
        "default_metrics": "faithfulness,g_eval",
        "default_min_score": 0.80,
    }


class TestConfigShow:
    def test_config_show(self, runner, mock_config_data):
        """11.1: config show prints valid JSON with current config."""
        with mock.patch("aievaluator.cli.get_all_config", return_value=mock_config_data):
            result = runner.invoke(main, ["config", "show"])
            assert result.exit_code == 0
            parsed = json.loads(result.output.strip())
            assert "api_key" in parsed or "engine_url" in parsed
            assert "sk-test" in result.output or "https://api.aievaluator.dev" in result.output

    def test_config_show_empty(self, runner):
        """11.1: config show with no config shows message."""
        with mock.patch("aievaluator.config.get_all_config", return_value={}):
            result = runner.invoke(main, ["config", "show"])
            assert result.exit_code == 0


class TestConfigSet:
    def test_config_set_valid_key(self, runner):
        """11.2: config set engine-url https://x.com → success message."""
        with mock.patch("aievaluator.cli.load_config", return_value={}):
            with mock.patch("aievaluator.cli.save_config") as mock_save:
                result = runner.invoke(
                    main, ["config", "set", "engine-url", "https://custom.api.dev"]
                )
                assert result.exit_code == 0
                assert "engine-url" in result.output

    def test_config_set_invalid_key(self, runner):
        """11.3: config set bad-key val → exit code 2, error message."""
        result = runner.invoke(main, ["config", "set", "bad-key", "value"])
        assert result.exit_code == 2

    def test_config_set_min_score_number(self, runner):
        """11.4: config set default-min-score 0.80 → stores as number."""
        with mock.patch("aievaluator.cli.load_config", return_value={}):
            with mock.patch("aievaluator.cli.save_config") as mock_save:
                result = runner.invoke(
                    main, ["config", "set", "default-min-score", "0.80"]
                )
                assert result.exit_code == 0
                # Verify save_config was called with the float value
                mock_save.assert_called_once()
                call_args = mock_save.call_args[0][0]
                assert call_args["default-min-score"] == 0.80

    def test_config_set_min_score_invalid(self, runner):
        """11.5: config set default-min-score abc → exit code 2."""
        result = runner.invoke(main, ["config", "set", "default-min-score", "abc"])
        assert result.exit_code == 2


class TestConfigUnset:
    def test_config_unset(self, runner):
        """11.6: config unset engine-url → removes key."""
        config_with_key = {"engine-url": "https://old.api.dev"}
        with mock.patch("aievaluator.cli.load_config", return_value=config_with_key):
            with mock.patch("aievaluator.cli.save_config") as mock_save:
                result = runner.invoke(main, ["config", "unset", "engine-url"])
                assert result.exit_code == 0
                assert "removed" in result.output.lower() or "✅" in result.output

    def test_config_unset_missing_key(self, runner):
        """11.7: config unset missing-key → "was not set" (no error)."""
        with mock.patch("aievaluator.cli.load_config", return_value={}):
            result = runner.invoke(main, ["config", "unset", "missing-key"])
            assert result.exit_code == 0
            assert "was not set" in result.output
