"""
Tests for AI Evaluator CLI — login command.

Covers: non-interactive login, invalid key, empty key, config persistence.
"""

import pytest
from unittest import mock
from unittest.mock import AsyncMock
from click.testing import CliRunner

from aievaluator.cli import main


@pytest.fixture
def runner():
    return CliRunner()


@pytest.fixture
def mock_usage_response():
    return {
        "tenant_name": "acme-corp",
        "tier": "pro",
        "evaluations_this_cycle": 42,
        "evaluations_limit": 5000,
        "input_tokens_this_cycle": 124800,
        "output_tokens_this_cycle": 89200,
    }


class TestLogin:
    def test_login_with_api_key_flag(self, runner, mock_usage_response):
        """7.1: Non-interactive login with --api-key."""
        with mock.patch("aievaluator.cli.APIClient") as MockClient:
            mock_client_instance = MockClient.return_value
            mock_client_instance.get_usage = AsyncMock(return_value=mock_usage_response)

            with mock.patch("aievaluator.cli.save_config") as mock_save:
                result = runner.invoke(main, ["login", "--api-key", "sk-test-123"])
                assert result.exit_code == 0
                mock_save.assert_called_once()

    def test_login_with_invalid_key(self, runner):
        """7.2: Bad API key → exit code 2, error message."""
        from aievaluator.api.client import APIError

        with mock.patch("aievaluator.cli.APIClient") as MockClient:
            mock_client_instance = MockClient.return_value
            mock_client_instance.get_usage = AsyncMock(side_effect=APIError(401, "Invalid API key"))

            result = runner.invoke(main, ["login", "--api-key", "sk-bad-key"])
            assert result.exit_code == 2

    def test_login_with_empty_key_interactive(self, runner):
        """7.3: Empty key → non-zero exit code, error message."""
        result = runner.invoke(main, ["login", "--api-key", ""], input="\n")
        assert result.exit_code != 0

    def test_login_saves_global_config(self, runner, mock_usage_response):
        """7.4: Key + engine URL persisted to global config file."""
        with mock.patch("aievaluator.cli.APIClient") as MockClient:
            mock_client_instance = MockClient.return_value
            mock_client_instance.get_usage = AsyncMock(return_value=mock_usage_response)

            with mock.patch("aievaluator.cli.save_config") as mock_save:
                result = runner.invoke(
                    main,
                    ["login", "--api-key", "sk-test-456", "--engine-url", "https://custom.api.dev"],
                )
                assert result.exit_code == 0
                call_args = mock_save.call_args[0][0]
                assert call_args["api_key"] == "sk-test-456"
                assert call_args["engine_url"] == "https://custom.api.dev"
