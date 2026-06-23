"""Tests for AI Evaluator CLI API client."""

import pytest
from aievaluator.api.client import APIClient, APIError


def test_client_init():
    client = APIClient("https://api.aievaluator.dev", api_key="test-key")
    assert client.engine_url == "https://api.aievaluator.dev"
    assert client.api_key == "test-key"

    client_no_key = APIClient("https://api.aievaluator.dev")
    assert client_no_key.api_key is None


def test_client_headers():
    client = APIClient("https://api.aievaluator.dev", api_key="test-key")
    headers = client._headers()
    assert headers["X-API-Key"] == "test-key"
    assert headers["Content-Type"] == "application/json"

    client_no_key = APIClient("https://api.aievaluator.dev")
    headers = client_no_key._headers()
    assert "X-API-Key" not in headers


def test_api_error():
    error = APIError(429, "Rate limited", detail={"retry_after": 60})
    assert error.status_code == 429
    assert "Rate limited" in str(error)
    assert error.detail == {"retry_after": 60}
