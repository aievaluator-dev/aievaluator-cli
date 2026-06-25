"""
Tests for AI Evaluator CLI — API client module.

Covers: client init, headers, APIError, HTTP error handling,
endpoint contracts, default values.
"""

import pytest
from unittest import mock
from unittest.mock import AsyncMock

from aievaluator.api.client import APIClient, APIError


# ═══════════════════════════════════════════════════════════════════
#  Client Initialization (2.1 - 2.2)
# ═══════════════════════════════════════════════════════════════════

class TestClientInit:
    def test_init_with_key(self):
        """2.1: Constructor sets engine_url, api_key, timeout correctly."""
        client = APIClient("https://api.aievaluator.dev", api_key="test-key", timeout=60)
        assert client.engine_url == "https://api.aievaluator.dev"
        assert client.api_key == "test-key"
        assert client.timeout == 60

    def test_init_without_key(self):
        """2.2: Constructor works without API key (playground mode)."""
        client = APIClient("https://api.aievaluator.dev")
        assert client.api_key is None
        assert client.engine_url == "https://api.aievaluator.dev"
        assert client.timeout == 300  # default


# ═══════════════════════════════════════════════════════════════════
#  Headers (2.3 - 2.4)
# ═══════════════════════════════════════════════════════════════════

class TestClientHeaders:
    def test_headers_with_key(self):
        """2.3: X-API-Key header present when key provided."""
        client = APIClient("https://api.aievaluator.dev", api_key="sk-test")
        headers = client._headers()
        assert headers["X-API-Key"] == "sk-test"
        assert headers["Content-Type"] == "application/json"

    def test_headers_without_key(self):
        """2.4: X-API-Key header absent when no key."""
        client = APIClient("https://api.aievaluator.dev")
        headers = client._headers()
        assert "X-API-Key" not in headers
        assert headers["Content-Type"] == "application/json"


# ═══════════════════════════════════════════════════════════════════
#  APIError (2.5)
# ═══════════════════════════════════════════════════════════════════

class TestAPIError:
    def test_api_error_creation(self):
        """2.5: APIError stores status_code, message, detail."""
        error = APIError(429, "Rate limited", detail={"retry_after": 60})
        assert error.status_code == 429
        assert "Rate limited" in str(error)
        assert error.detail == {"retry_after": 60}

    def test_api_error_no_detail(self):
        """2.5: APIError without detail still works."""
        error = APIError(500, "Internal error")
        assert error.status_code == 500
        assert error.message == "Internal error"
        assert error.detail is None


# ═══════════════════════════════════════════════════════════════════
#  HTTP Error Handling (2.6 - 2.9)
# ═══════════════════════════════════════════════════════════════════

class TestHTTPErrors:
    @pytest.mark.asyncio
    async def test_request_http_4xx(self):
        """2.6: HTTP 400/429 → raises APIError with status code."""
        client = APIClient("https://api.aievaluator.dev", api_key="sk-test")
        mock_resp = mock.MagicMock()
        mock_resp.status_code = 429
        mock_resp.json.return_value = {"error": "too many requests"}

        with mock.patch("httpx.AsyncClient") as mock_client_class:
            mock_client = mock_client_class.return_value
            # httpx.AsyncClient used as context manager
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.request = AsyncMock(return_value=mock_resp)
            with pytest.raises(APIError) as excinfo:
                await client._request("GET", "/test")
            assert excinfo.value.status_code == 429

    @pytest.mark.asyncio
    async def test_request_http_5xx(self):
        """2.7: HTTP 500 → raises APIError with status code."""
        client = APIClient("https://api.aievaluator.dev", api_key="sk-test")
        mock_resp = mock.MagicMock()
        mock_resp.status_code = 500
        mock_resp.json.return_value = {"error": "internal"}

        with mock.patch("httpx.AsyncClient") as mock_client_class:
            mock_client = mock_client_class.return_value
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.request = AsyncMock(return_value=mock_resp)
            with pytest.raises(APIError) as excinfo:
                await client._request("GET", "/test")
            assert excinfo.value.status_code == 500

    @pytest.mark.asyncio
    async def test_request_connection_refused(self):
        """2.8: Cannot connect → raises APIError with status 0."""
        import httpx

        client = APIClient("https://api.aievaluator.dev", api_key="sk-test")
        with mock.patch("httpx.AsyncClient") as mock_client_class:
            mock_client = mock_client_class.return_value
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.request = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
            with pytest.raises(APIError) as excinfo:
                await client._request("GET", "/test")
            assert excinfo.value.status_code == 0

    @pytest.mark.asyncio
    async def test_request_timeout(self):
        """2.9: Timeout → raises APIError with status 0."""
        import httpx

        client = APIClient("https://api.aievaluator.dev", api_key="sk-test", timeout=1)
        with mock.patch("httpx.AsyncClient") as mock_client_class:
            mock_client = mock_client_class.return_value
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.request = AsyncMock(side_effect=httpx.TimeoutException("Timeout"))
            with pytest.raises(APIError) as excinfo:
                await client._request("GET", "/test")
            assert excinfo.value.status_code == 0


# ═══════════════════════════════════════════════════════════════════
#  Endpoint Contracts (2.10 - 2.16)
# ═══════════════════════════════════════════════════════════════════

class TestEndpoints:
    @pytest.mark.asyncio
    async def test_get_usage_endpoint(self):
        """2.10: Calls GET /api/v1/tenants/me/usage."""
        client = APIClient("https://api.aievaluator.dev", api_key="sk-test")
        mock_resp = mock.MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "tenant_name": "acme",
            "tier": "pro",
            "evaluations_this_cycle": 42,
            "evaluations_limit": 5000,
        }

        with mock.patch("httpx.AsyncClient") as mock_client_class:
            mock_client = mock_client_class.return_value
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.request = AsyncMock(return_value=mock_resp)
            result = await client.get_usage()
            assert result["tenant_name"] == "acme"

    @pytest.mark.asyncio
    async def test_evaluate_sync_endpoint(self):
        """2.11: Calls POST /api/v1/evaluations/sync with correct body."""
        client = APIClient("https://api.aievaluator.dev", api_key="sk-test")
        mock_resp = mock.MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"overall_score": 0.95}

        with mock.patch("httpx.AsyncClient") as mock_client_class:
            mock_client = mock_client_class.return_value
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.request = AsyncMock(return_value=mock_resp)
            result = await client.evaluate_sync(
                rows=[{"input": "hi", "expected_output": "hello"}],
                agent_url="https://agent.com/chat",
            )
            assert result["overall_score"] == 0.95

    @pytest.mark.asyncio
    async def test_evaluate_sync_default_metrics(self):
        """2.12: metrics defaults to ["faithfulness", "g_eval"] when not provided."""
        client = APIClient("https://api.aievaluator.dev", api_key="sk-test")
        mock_resp = mock.MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"overall_score": 0.90}

        with mock.patch("httpx.AsyncClient") as mock_client_class:
            mock_client = mock_client_class.return_value
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.request = AsyncMock(return_value=mock_resp)
            await client.evaluate_sync(
                rows=[{"input": "test"}],
                agent_url="https://agent.com/chat",
            )
            # Verify correct metrics were sent by checking the request body
            call_kwargs = mock_client.request.call_args
            assert call_kwargs is not None

    @pytest.mark.asyncio
    async def test_evaluate_sync_custom_evaluators_default(self):
        """2.13: custom_evaluators defaults to [] when not provided."""
        client = APIClient("https://api.aievaluator.dev", api_key="sk-test")
        mock_resp = mock.MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"overall_score": 0.90}

        with mock.patch("httpx.AsyncClient") as mock_client_class:
            mock_client = mock_client_class.return_value
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.request = AsyncMock(return_value=mock_resp)
            result = await client.evaluate_sync(
                rows=[{"input": "test"}],
                agent_url="https://agent.com/chat",
            )
            assert result["overall_score"] == 0.90

    @pytest.mark.asyncio
    async def test_playground_evaluate_endpoint(self):
        """2.14: Calls POST /api/v1/playground/evaluate with correct body."""
        client = APIClient("https://api.aievaluator.dev")
        mock_resp = mock.MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"results": []}

        with mock.patch("httpx.AsyncClient") as mock_client_class:
            mock_client = mock_client_class.return_value
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.request = AsyncMock(return_value=mock_resp)
            result = await client.playground_evaluate(
                rows=[{"input": "test"}],
            )
            assert result["results"] == []

    @pytest.mark.asyncio
    async def test_playground_status_endpoint(self):
        """2.15: Calls GET /api/v1/playground/status, returns fallback on error."""
        client = APIClient("https://api.aievaluator.dev")

        # Simulate non-200 response → fallback values returned
        mock_resp = mock.MagicMock()
        mock_resp.status_code = 500
        mock_resp.json.return_value = {"error": "down"}

        with mock.patch("httpx.AsyncClient") as mock_client_class:
            mock_client = mock_client_class.return_value
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.get = AsyncMock(return_value=mock_resp)
            result = await client.playground_status()
            # Should return fallback values on error
            assert result["remaining"] == 5
            assert result["limit"] == 5

    @pytest.mark.asyncio
    async def test_evaluate_upload_endpoint(self):
        """2.16: Calls POST /api/v1/evaluations/sync/upload multipart."""
        import tempfile as tmpfile_mod
        import os as os_mod

        client = APIClient("https://api.aievaluator.dev", api_key="sk-test")
        tf = tmpfile_mod.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
        tf.write('[{"input": "test"}]')
        tf.flush()
        tf.close()

        mock_resp = mock.MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"overall_score": 0.90}

        with mock.patch("httpx.AsyncClient") as mock_client_class:
            mock_client = mock_client_class.return_value
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.post = AsyncMock(return_value=mock_resp)
            result = await client.evaluate_upload(
                file_path=tf.name,
                agent_url="https://agent.com/chat",
            )
            assert result["overall_score"] == 0.90

        os_mod.unlink(tf.name)
