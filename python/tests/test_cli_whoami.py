"""
Tests for AI Evaluator CLI — whoami command.

Covers: not logged in, valid key, --api-key flag override.
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


class TestWhoami:
    def test_whoami_not_logged_in(self, runner):
        """8.1: No key → exit code 2, "Not logged in" message."""
        with mock.patch("aievaluator.cli.resolve_api_key", return_value=None):
            result = runner.invoke(main, ["whoami"])
            assert result.exit_code == 2
            assert "Not logged in" in result.output

    def test_whoami_with_valid_key(self, runner, mock_usage_response):
        """8.2: Shows tenant name, tier, evals, tokens."""
        with mock.patch("aievaluator.cli.resolve_api_key", return_value="sk-test"):
            with mock.patch("aievaluator.cli.APIClient") as MockClient:
                mock_client_instance = MockClient.return_value
                mock_client_instance.get_usage = AsyncMock(return_value=mock_usage_response)

                result = runner.invoke(main, ["whoami"])
                assert result.exit_code == 0
                assert "acme-corp" in result.output
                assert "pro" in result.output

    def test_whoami_with_api_key_flag(self, runner, mock_usage_response):
        """8.3: --api-key flag overrides config."""
        with mock.patch("aievaluator.cli.resolve_api_key", return_value="sk-flag-override"):
            with mock.patch("aievaluator.cli.APIClient") as MockClient:
                mock_client_instance = MockClient.return_value
                mock_client_instance.get_usage = AsyncMock(return_value=mock_usage_response)

                result = runner.invoke(main, ["whoami", "--api-key", "sk-flag-override"])
                assert result.exit_code == 0
                assert "acme-corp" in result.output
