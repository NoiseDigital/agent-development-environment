"""Stats proxy — forwards `/api/v1/stats/<endpoint>` to the mcp-stats service.

The Analyze page calls statistics endpoints (correlate / qa / describe) that
live on the mcp-stats container. The browser cannot reach mcp-stats directly
once we deploy to GCP — mcp-stats sits behind internal-only Cloud Run ingress
— so the gateway is the seam.

In local development this is a thin pass-through that lets us also stop
exposing `NEXT_PUBLIC_STATS_BASE_URL` to the frontend. In production it's
load-bearing: it's how the public ingress reaches the private stats service.

Mounted under `/api/v1/stats/...` (the `/api/v1` parent lives in main.py); the
upstream path is `/api/<endpoint>` so the mcp-stats Starlette routes
(`/api/correlate`, `/api/qa`, `/api/describe`) match unchanged.
"""

from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from .auth import CurrentUser, current_user

STATS_URL = os.getenv("STATS_URL", "http://mcp-stats:8080")

router = APIRouter(prefix="/stats", tags=["stats"])

# Allowlisted upstream paths — the gateway never forwards an arbitrary path.
# Mirrors the stats server's HTTP routes; if we add a new stats endpoint there
# we add it here too.
ALLOWED_ENDPOINTS = frozenset({"correlate", "qa", "describe"})


@router.post("/{endpoint}")
async def stats_proxy(
    endpoint: str,
    request: Request,
    _user: CurrentUser = Depends(current_user),
) -> JSONResponse:
    """Forward a POST to the matching mcp-stats HTTP endpoint."""
    if endpoint not in ALLOWED_ENDPOINTS:
        raise HTTPException(404, f"unknown stats endpoint: {endpoint}")

    body = await request.body()
    upstream = f"{STATS_URL}/api/{endpoint}"

    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
        try:
            resp = await client.post(
                upstream,
                content=body,
                headers={"content-type": "application/json"},
            )
        except httpx.HTTPError as exc:
            raise HTTPException(502, f"stats upstream unreachable: {exc}") from exc

    # mcp-stats returns JSON for every response (success or error); preserve
    # the status code so a 400 from the upstream stays a 400 here.
    try:
        return JSONResponse(resp.json(), status_code=resp.status_code)
    except ValueError:
        return JSONResponse(
            {"error": "stats upstream returned non-JSON"},
            status_code=502,
        )
