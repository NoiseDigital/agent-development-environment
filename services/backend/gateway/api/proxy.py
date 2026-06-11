"""Agent proxy — forwards traffic to the private agent service.

A single catch-all route handles every method and every path, including the
ADK SSE stream (`/run_sse`). We use `httpx.AsyncClient.stream(...)` and pipe
the response back through Starlette's `StreamingResponse` so each chunk
arrives at the browser as it lands at the agent — critical for SSE which is
useless without per-line flushing.

Security posture:
- The upstream sees ONLY headers the gateway forwards. We drop hop-by-hop
  headers and drop the inbound `X-Dev-User` so a browser can't impersonate a
  user; we then forward the user resolved by `current_user` instead.
- Cookies and the inbound `Authorization` header are NOT forwarded — the
  gateway is the auth boundary and the agent runs on the private network.
"""

from __future__ import annotations

import os
from typing import AsyncIterator

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from .auth import CurrentUser, current_user

AGENT_URL = os.getenv("AGENT_URL", "http://agent:8000")

# Per https://www.rfc-editor.org/rfc/rfc7230#section-6.1 these are not safe to
# forward across a proxy hop. Lowercase keys; we filter case-insensitively.
HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
}

# Headers that name the gateway as the auth boundary — the client can't set
# them and have them reach the upstream.
STRIPPED_FROM_CLIENT = {"x-dev-user", "authorization", "cookie"}

router = APIRouter()


def _filter_request_headers(
    headers: dict[str, str], user: CurrentUser
) -> dict[str, str]:
    out = {
        k: v
        for k, v in headers.items()
        if k.lower() not in HOP_BY_HOP and k.lower() not in STRIPPED_FROM_CLIENT
    }
    # The agent reads identity from this header today; once both services
    # share a Firebase verifier, this becomes a signed JWT instead.
    out["X-Dev-User"] = user.uid
    return out


def _filter_response_headers(headers: httpx.Headers) -> dict[str, str]:
    return {k: v for k, v in headers.items() if k.lower() not in HOP_BY_HOP}


@router.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    include_in_schema=False,
)
async def proxy_to_agent(
    path: str,
    request: Request,
    user: CurrentUser = Depends(current_user),
) -> StreamingResponse:
    """Forward the request to the agent and stream the response back.

    `path` is captured from the URL after the gateway's prefix is stripped
    (the router mounts this at `/`); the upstream sees the same path the
    client requested.
    """
    upstream_url = f"{AGENT_URL}/{path}"
    forward_headers = _filter_request_headers(dict(request.headers), user)
    body = await request.body()

    # Keep a long timeout for SSE — `/run_sse` holds the connection open while
    # the model streams events. The connect timeout is short, the read is open.
    timeout = httpx.Timeout(connect=5.0, read=None, write=30.0, pool=5.0)

    client = httpx.AsyncClient(timeout=timeout)
    upstream = client.stream(
        request.method,
        upstream_url,
        headers=forward_headers,
        content=body if body else None,
        params=dict(request.query_params),
    )
    # We can't `async with` here because the iterator must outlive this scope
    # — StreamingResponse consumes it after we return. We close the client
    # when the iterator is exhausted.
    response = await upstream.__aenter__()

    async def body_iter() -> AsyncIterator[bytes]:
        try:
            async for chunk in response.aiter_raw():
                yield chunk
        finally:
            await upstream.__aexit__(None, None, None)
            await client.aclose()

    return StreamingResponse(
        body_iter(),
        status_code=response.status_code,
        headers=_filter_response_headers(response.headers),
        media_type=response.headers.get("content-type"),
    )
