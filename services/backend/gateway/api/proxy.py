"""Agent proxy — forwards traffic to the private agent service.

A single catch-all route handles every method and every path, including the
ADK SSE stream (`/run_sse`). We use `httpx.AsyncClient.stream(...)` and pipe
the response back through Starlette's `StreamingResponse` so each chunk
arrives at the browser as it lands at the agent — critical for SSE which is
useless without per-line flushing.

Security posture:
- The upstream sees ONLY headers the gateway forwards. We drop hop-by-hop
  headers and drop the inbound `X-User-*` so a browser can't impersonate a
  user; we then forward the user resolved by `current_user` instead.
- Cookies and the inbound `Authorization` header are NOT forwarded — the
  gateway is the auth boundary and the agent runs on the private network.
"""

from __future__ import annotations

import logging
import os
from typing import AsyncIterator

import httpx
from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import StreamingResponse

from ._idtoken import id_token_for
from .auth import CurrentUser, current_user

log = logging.getLogger(__name__)

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

# Headers the gateway owns as the auth boundary — a client can't set them and
# have them reach the upstream. The identity headers (`x-user-id`/`x-user-email`)
# are stripped from the inbound request and RE-asserted below from the
# gateway-resolved user, so a browser can never spoof an identity through.
#
# `host` is critical: Cloud Run's front end routes by the Host header, and the
# inbound one is the GATEWAY's host. Forwarding it would route this hop to the
# gateway itself (so the agent's token audience never matches → 401, and the
# agent is never reached). Dropping it lets httpx regenerate Host from the
# target URL so the request actually lands on the agent service.
STRIPPED_FROM_CLIENT = {"x-user-id", "x-user-email", "authorization", "cookie", "host"}

router = APIRouter()


def _filter_request_headers(
    headers: dict[str, str], user: CurrentUser
) -> dict[str, str]:
    out = {
        k: v
        for k, v in headers.items()
        if k.lower() not in HOP_BY_HOP and k.lower() not in STRIPPED_FROM_CLIENT
    }
    # The agent reads identity from this header (the real Firebase uid in any
    # deployed env). The next hardening step is a forwarded ID token the agent
    # verifies itself, rather than trusting this header over the IAM boundary.
    out["X-User-Id"] = user.uid
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
) -> Response:
    """Forward the request to the agent and stream the response back.

    `path` is captured from the URL after the gateway's prefix is stripped
    (the router mounts this at `/`); the upstream sees the same path the
    client requested.
    """
    upstream_url = f"{AGENT_URL}/{path}"
    forward_headers = _filter_request_headers(dict(request.headers), user)
    # Authenticate to the internal-ingress agent service with a Google-signed ID
    # token (audience = the agent's URL). None off-GCP, where the agent is plain
    # HTTP on the compose network.
    token = id_token_for(AGENT_URL)
    if token:
        forward_headers["Authorization"] = f"Bearer {token}"
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
    if response.status_code in (401, 403):
        # Cloud Run puts the IAM rejection reason in WWW-Authenticate + body.
        # Read it (error bodies are tiny) so the cause is unambiguous, then
        # return it instead of streaming.
        body = await response.aread()
        log.error(
            "agent upstream rejected %s /%s -> %s; www-authenticate=%r body=%r",
            request.method,
            path,
            response.status_code,
            response.headers.get("www-authenticate"),
            body[:400],
        )
        await upstream.__aexit__(None, None, None)
        await client.aclose()
        return Response(
            content=body,
            status_code=response.status_code,
            headers=_filter_response_headers(response.headers),
        )

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
