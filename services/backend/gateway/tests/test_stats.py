"""Stats proxy route — the seam between the browser and the mcp-stats service.

We stub httpx so the route runs end-to-end without standing up mcp-stats.
The allowlist + upstream-URL composition + status-code propagation are the
load-bearing pieces; a regression in any of them breaks the Analyze page or
exposes a path the proxy shouldn't forward.
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

import api.stats as stats_module
from main import app


class FakeAsyncClient:
    """Stand-in for httpx.AsyncClient — records the outgoing request and
    returns whatever the test queued."""

    last_request: dict[str, Any] | None = None
    next_response: tuple[int, Any] = (200, {"ok": True})
    raises: Exception | None = None

    def __init__(self, *_args: Any, **_kwargs: Any) -> None:
        pass

    async def __aenter__(self) -> "FakeAsyncClient":
        return self

    async def __aexit__(self, *_args: Any) -> None:
        return None

    async def post(
        self, url: str, *, content: bytes, headers: dict[str, str]
    ) -> httpx.Response:
        if FakeAsyncClient.raises:
            raise FakeAsyncClient.raises
        FakeAsyncClient.last_request = {
            "url": url,
            "content": content,
            "headers": headers,
        }
        status, body = FakeAsyncClient.next_response
        return httpx.Response(status, json=body)


@pytest.fixture
def stats_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(stats_module.httpx, "AsyncClient", FakeAsyncClient)
    FakeAsyncClient.last_request = None
    FakeAsyncClient.next_response = (200, {"ok": True})
    FakeAsyncClient.raises = None
    return TestClient(app)


class TestAllowlist:
    def test_forwards_correlate(self, stats_client: TestClient) -> None:
        FakeAsyncClient.next_response = (200, {"method": "pearson", "rows": []})
        r = stats_client.post("/api/stats/correlate", json={"source": "upload:1"})
        assert r.status_code == 200
        assert FakeAsyncClient.last_request is not None
        assert FakeAsyncClient.last_request["url"].endswith("/api/correlate")

    def test_forwards_qa(self, stats_client: TestClient) -> None:
        stats_client.post("/api/stats/qa", json={"source": "upload:1"})
        assert FakeAsyncClient.last_request is not None
        assert FakeAsyncClient.last_request["url"].endswith("/api/qa")

    def test_forwards_describe(self, stats_client: TestClient) -> None:
        stats_client.post("/api/stats/describe", json={"source": "upload:1"})
        assert FakeAsyncClient.last_request is not None
        assert FakeAsyncClient.last_request["url"].endswith("/api/describe")

    def test_rejects_endpoint_not_on_allowlist(self, stats_client: TestClient) -> None:
        r = stats_client.post("/api/stats/exec_arbitrary_sql", json={})
        assert r.status_code == 404
        assert FakeAsyncClient.last_request is None  # never touched the upstream


class TestRequestForwarding:
    def test_forwards_the_request_body_verbatim(self, stats_client: TestClient) -> None:
        body = {"source": "upload:1", "method": "spearman", "alpha": 0.01}
        stats_client.post("/api/stats/correlate", json=body)
        assert FakeAsyncClient.last_request is not None
        import json as _json

        assert _json.loads(FakeAsyncClient.last_request["content"]) == body

    def test_sets_content_type_on_upstream_request(
        self, stats_client: TestClient
    ) -> None:
        stats_client.post("/api/stats/correlate", json={"source": "upload:1"})
        assert FakeAsyncClient.last_request is not None
        assert (
            FakeAsyncClient.last_request["headers"]["content-type"]
            == "application/json"
        )


class TestResponsePropagation:
    def test_propagates_upstream_status_and_body(
        self, stats_client: TestClient
    ) -> None:
        FakeAsyncClient.next_response = (400, {"error": "bad source"})
        r = stats_client.post("/api/stats/correlate", json={"source": "garbage"})
        assert r.status_code == 400
        assert r.json() == {"error": "bad source"}

    def test_upstream_500_becomes_500_on_the_gateway(
        self, stats_client: TestClient
    ) -> None:
        FakeAsyncClient.next_response = (500, {"error": "stats crashed"})
        r = stats_client.post("/api/stats/correlate", json={"source": "upload:1"})
        assert r.status_code == 500


class TestUpstreamFailure:
    def test_unreachable_upstream_becomes_502(self, stats_client: TestClient) -> None:
        FakeAsyncClient.raises = httpx.ConnectError("connection refused")
        r = stats_client.post("/api/stats/correlate", json={"source": "upload:1"})
        assert r.status_code == 502
        assert "stats upstream unreachable" in r.json()["detail"]
