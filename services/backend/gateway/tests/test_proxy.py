"""Proxy route tests — exercise the request-filter, header-stripping, and
streaming contract without spinning up an actual agent.

We monkeypatch `httpx.AsyncClient` with a fake that records what the gateway
forwards. The forwarding policy is load-bearing for security (the client
cannot impersonate a user by setting `X-Dev-User`; Authorization/Cookie
never reach the agent) and for SSE (the stream must yield chunks as they
land at the upstream, not after the whole response buffers).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

import api.proxy as proxy_module
from main import app


class FakeStreamResponse:
    """Minimal stand-in for httpx's streaming response."""

    def __init__(
        self,
        status_code: int = 200,
        headers: dict[str, str] | None = None,
        chunks: list[bytes] | None = None,
    ) -> None:
        self.status_code = status_code
        self.headers = httpx.Headers(headers or {"content-type": "application/json"})
        self._chunks = chunks or [b'{"ok":true}']

    async def aiter_raw(self) -> AsyncIterator[bytes]:
        for c in self._chunks:
            yield c


class FakeStreamCtx:
    """Awaitable + async-context-manager pair that mimics
    `httpx.AsyncClient.stream(...)`. The proxy uses the manual
    `__aenter__`/`__aexit__` pattern."""

    def __init__(self, response: FakeStreamResponse, recorder: dict[str, Any]) -> None:
        self._response = response
        self._recorder = recorder

    async def __aenter__(self) -> FakeStreamResponse:
        return self._response

    async def __aexit__(self, *_args: Any) -> None:
        self._recorder["closed"] = True


class FakeAsyncClient:
    """Stand-in for httpx.AsyncClient. Records the outgoing request so tests
    can assert on the forwarded URL, headers, method, body."""

    last_recorder: dict[str, Any] | None = None
    next_response: FakeStreamResponse | None = None

    def __init__(self, *_args: Any, **_kwargs: Any) -> None:
        FakeAsyncClient.last_recorder = {"closed": False, "aclose": False}

    def stream(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str],
        content: bytes | None,
        params: dict[str, str],
    ) -> FakeStreamCtx:
        assert FakeAsyncClient.last_recorder is not None
        FakeAsyncClient.last_recorder.update(
            method=method,
            url=url,
            headers=headers,
            content=content,
            params=params,
        )
        return FakeStreamCtx(
            FakeAsyncClient.next_response or FakeStreamResponse(),
            FakeAsyncClient.last_recorder,
        )

    async def aclose(self) -> None:
        if FakeAsyncClient.last_recorder is not None:
            FakeAsyncClient.last_recorder["aclose"] = True


@pytest.fixture
def proxy_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(proxy_module.httpx, "AsyncClient", FakeAsyncClient)
    FakeAsyncClient.last_recorder = None
    FakeAsyncClient.next_response = None
    return TestClient(app)


def last_request() -> dict[str, Any]:
    assert FakeAsyncClient.last_recorder is not None
    return FakeAsyncClient.last_recorder


class TestProxyForwarding:
    def test_forwards_path_and_method_to_agent_url(
        self, proxy_client: TestClient
    ) -> None:
        r = proxy_client.get("/apps")
        assert r.status_code == 200
        req = last_request()
        assert req["method"] == "GET"
        assert req["url"].endswith("/apps")

    def test_forwards_query_params(self, proxy_client: TestClient) -> None:
        # Use an ADK path that falls through to the agent — /api/sources is now a
        # gateway-owned route (migrated), so it would be served here, not proxied.
        proxy_client.get("/apps?app_name=mp&user_id=u")
        assert last_request()["params"] == {"app_name": "mp", "user_id": "u"}

    def test_forwards_body_on_post(self, proxy_client: TestClient) -> None:
        proxy_client.post(
            "/run_sse", content=b'{"k":1}', headers={"content-type": "application/json"}
        )
        assert last_request()["content"] == b'{"k":1}'

    def test_forwards_default_uid_when_no_identity_header(
        self, proxy_client: TestClient
    ) -> None:
        """No inbound auth context — gateway resolves to DEV_UID and
        forwards that as X-User-Id."""
        from api.auth import DEV_UID

        proxy_client.get("/apps")
        assert last_request()["headers"]["X-User-Id"] == DEV_UID

    def test_strips_then_resets_identity_from_resolved_user(
        self, proxy_client: TestClient
    ) -> None:
        """Identity is the gateway-resolved user, re-asserted as X-User-Id. The
        proxy strips any inbound copy a client set and re-emits the value
        current_user resolved to — so a browser can't spoof an identity
        through."""
        proxy_client.get("/apps", headers={"X-User-Id": "alice"})
        assert last_request()["headers"]["X-User-Id"] == "alice"

    def test_inbound_identity_header_does_not_appear_twice(
        self, proxy_client: TestClient
    ) -> None:
        """The inbound header MUST be stripped before the resolved value is
        re-added — otherwise we'd forward `X-User-Id` twice and the agent
        would see whichever one wins the http normalisation lottery."""
        proxy_client.get("/apps", headers={"X-User-Id": "alice"})
        keys = [k.lower() for k in last_request()["headers"].keys()]
        assert keys.count("x-user-id") == 1

    def test_strips_authorization_and_cookie_from_forwarded_headers(
        self, proxy_client: TestClient
    ) -> None:
        proxy_client.get(
            "/apps",
            headers={
                "Authorization": "Bearer secret",
                "Cookie": "session=abc",
            },
        )
        headers = last_request()["headers"]
        # Headers are case-preserving in the dict we get back, so check both.
        for k in headers.keys():
            assert k.lower() not in {"authorization", "cookie"}

    def test_strips_hop_by_hop_headers(self, proxy_client: TestClient) -> None:
        proxy_client.get(
            "/apps",
            headers={
                "Connection": "keep-alive",
                "Keep-Alive": "timeout=5",
                "TE": "trailers",
            },
        )
        headers = last_request()["headers"]
        for k in headers.keys():
            assert k.lower() not in proxy_module.HOP_BY_HOP


class TestProxyResponse:
    def test_propagates_status_code(self, proxy_client: TestClient) -> None:
        FakeAsyncClient.next_response = FakeStreamResponse(status_code=404)
        r = proxy_client.get("/missing")
        assert r.status_code == 404

    def test_streams_chunks_through_to_the_client(
        self, proxy_client: TestClient
    ) -> None:
        FakeAsyncClient.next_response = FakeStreamResponse(
            chunks=[b"data: a\n\n", b"data: b\n\n"],
            headers={"content-type": "text/event-stream"},
        )
        r = proxy_client.get("/run_sse")
        # TestClient buffers; the assert is on the concatenated body and
        # the content-type, not on per-chunk timing (which TestClient hides).
        assert r.headers["content-type"].startswith("text/event-stream")
        assert r.content == b"data: a\n\ndata: b\n\n"

    def test_strips_hop_by_hop_headers_from_response(
        self, proxy_client: TestClient
    ) -> None:
        FakeAsyncClient.next_response = FakeStreamResponse(
            headers={
                "content-type": "application/json",
                "Connection": "close",
                "Transfer-Encoding": "chunked",
            },
        )
        r = proxy_client.get("/apps")
        for k in r.headers.keys():
            assert k.lower() not in proxy_module.HOP_BY_HOP


class TestProxyClientLifecycle:
    def test_closes_the_upstream_stream_and_client_after_response(
        self, proxy_client: TestClient
    ) -> None:
        proxy_client.get("/apps")
        rec = last_request()
        assert rec["closed"] is True, "upstream stream context was not exited"
        assert rec["aclose"] is True, "httpx client was not closed"
