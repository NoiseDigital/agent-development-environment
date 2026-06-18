"""Service-to-service authentication for internal Cloud Run hops.

The gateway calls sibling services (agents, mcp-stats, mcp-toolbox) that run
with INTERNAL-only ingress. Routing the call through the VPC reaches their
ingress, but Cloud Run still rejects it (HTTP 403) unless the caller presents a
Google-signed OIDC ID token whose audience matches the target service — exactly
how the frontend BFF authenticates to the gateway. This mints that token.

Off-GCP (local dev, tests) the sibling URLs are plain `http://` and there's no
metadata server, so `id_token_for` returns None and callers fall back to an
unauthenticated request — the compose network is the boundary there.
"""

from __future__ import annotations

import logging
import time

import google.auth.transport.requests
import google.oauth2.id_token

log = logging.getLogger(__name__)

_request = google.auth.transport.requests.Request()
# ID tokens live ~60 min; cache per-audience and refresh well before expiry so a
# busy proxy doesn't hit the metadata server on every request.
_TTL_SECONDS = 50 * 60
_cache: dict[str, tuple[str, float]] = {}


def id_token_for(audience: str) -> str | None:
    """An OIDC ID token for `audience` (a Cloud Run service URL), or None when
    not running on GCP (the audience is a local plain-HTTP URL)."""
    if not audience.startswith("https://"):
        return None

    cached = _cache.get(audience)
    now = time.monotonic()
    if cached and cached[1] > now:
        return cached[0]

    try:
        token = google.oauth2.id_token.fetch_id_token(_request, audience)
    except Exception as exc:  # noqa: BLE001 — off-GCP / metadata unavailable
        log.warning("could not mint ID token for %s: %s", audience, exc)
        return None

    _cache[audience] = (token, now + _TTL_SECONDS)
    return token
