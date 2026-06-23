"""HTTP client for AI Evaluator Engine API."""

import json as json_mod
from typing import Any, Optional

import httpx


class APIError(Exception):
    """Error from the AI Evaluator API."""

    def __init__(self, status_code: int, message: str, detail: Any = None):
        self.status_code = status_code
        self.message = message
        self.detail = detail
        super().__init__(message)


class APIClient:
    """Thin HTTP wrapper around the AI Evaluator Engine API."""

    def __init__(self, engine_url: str, api_key: Optional[str] = None, timeout: int = 300):
        self.engine_url = engine_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def _headers(self) -> dict:
        h = {"Content-Type": "application/json"}
        if self.api_key:
            h["X-API-Key"] = self.api_key
        return h

    async def _request(
        self,
        method: str,
        path: str,
        json_data: Optional[dict] = None,
        data: Optional[dict] = None,
        files: Optional[dict] = None,
    ) -> dict:
        """Make an HTTP request to the engine. Raises APIError on failure."""
        url = f"{self.engine_url}{path}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                if files:
                    resp = await client.request(
                        method, url, data=data, files=files, headers={"X-API-Key": self.api_key} if self.api_key else {},
                    )
                else:
                    resp = await client.request(
                        method, url, json=json_data, headers=self._headers(),
                    )
            except httpx.ConnectError:
                raise APIError(0, f"Cannot connect to {self.engine_url}")
            except httpx.TimeoutException:
                raise APIError(0, f"Request timed out after {self.timeout}s")

        if resp.status_code >= 400:
            detail = None
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            raise APIError(resp.status_code, f"Engine returned HTTP {resp.status_code}", detail)

        return resp.json()

    async def health(self) -> dict:
        """GET /health"""
        return await self._request("GET", "/health")

    async def get_usage(self) -> dict:
        """GET /api/v1/tenants/me/usage"""
        return await self._request("GET", "/api/v1/tenants/me/usage")

    async def evaluate_sync(
        self,
        rows: list[dict],
        agent_url: str,
        agent_format: str = "openai",
        metrics: Optional[list[str]] = None,
        judge_model: Optional[str] = None,
        name: Optional[str] = None,
        custom_evaluators: list[dict] | None = None,
    ) -> dict:
        """POST /api/v1/evaluations/sync"""
        agent_json = {"url": agent_url, "format": agent_format}
        body = {
            "rows": rows,
            "agent": agent_json,
            "metrics": metrics or ["faithfulness", "g_eval"],
            "custom_evaluators": custom_evaluators or [],
        }
        if name:
            body["name"] = name
        if judge_model:
            body["judge_model"] = judge_model

        return await self._request("POST", "/api/v1/evaluations/sync", json_data=body)

    async def evaluate_upload(
        self,
        file_path: str,
        agent_url: str,
        agent_format: str = "openai",
        metrics: Optional[str] = None,
    ) -> dict:
        """POST /api/v1/evaluations/sync/upload (multipart form upload)."""
        import os

        url = f"{self.engine_url}/api/v1/evaluations/sync/upload"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                with open(file_path, "rb") as f:
                    files = {"file": (os.path.basename(file_path), f, "application/json")}
                    data = {
                        "agent_endpoint": agent_url,
                        "agent_format": agent_format,
                        "metrics": metrics or "faithfulness,g_eval",
                    }
                    resp = await client.post(
                        url,
                        data=data,
                        files=files,
                        headers={"X-API-Key": self.api_key} if self.api_key else {},
                    )
            except httpx.ConnectError:
                raise APIError(0, f"Cannot connect to {self.engine_url}")
            except httpx.TimeoutException:
                raise APIError(0, f"Request timed out after {self.timeout}s")

        if resp.status_code >= 400:
            detail = None
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            raise APIError(resp.status_code, f"Engine returned HTTP {resp.status_code}", detail)

        return resp.json()

    async def playground_evaluate(
        self,
        queries: Optional[list[str]] = None,
        rows: Optional[list[dict]] = None,
        agent_endpoint: Optional[str] = None,
        agent_config: Optional[dict] = None,
        metrics: Optional[list[str]] = None,
        judge: Optional[str] = None,
    ) -> dict:
        """POST /api/v1/playground/evaluate (no auth required)."""
        body: dict = {"metrics": metrics or ["faithfulness", "g_eval"]}
        if queries:
            body["queries"] = queries
        if rows:
            body["rows"] = rows
        if agent_config:
            body["agent"] = agent_config
        if agent_endpoint:
            body["agent_endpoint"] = agent_endpoint
        if judge:
            body["judge"] = judge
        return await self._request("POST", "/api/v1/playground/evaluate", json_data=body)

    async def playground_status(self) -> dict:
        """GET /api/v1/playground/status (no auth required)."""
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{self.engine_url}/api/v1/playground/status")
        if resp.status_code >= 400:
            return {"used": 0, "limit": 5, "remaining": 5, "resets_at": "midnight UTC"}
        return resp.json()
