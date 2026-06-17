"""Health endpoints.

`/healthz` is the trivial liveness probe (compose `depends_on`, Cloud Run
startup/liveness) — deliberately dependency-free so the container stays green
even when a downstream wobbles.

`/healthz/deep` is the post-deploy smoke target. It exercises the exact
service-to-service hops that only exist in a deployed environment (DB, the
gateway→agents / gateway→toolbox / gateway→stats IAM-token calls), which local
dev can't reproduce. CI hits it through the public BFF (`/gw/healthz/deep`) and
fails the pipeline if any check is red — turning "find it in prod by clicking"
into "find it in CI". It's intentionally cheap (no model calls), so it's safe to
leave reachable; a model-reachability check belongs behind an auth token.
"""

from __future__ import annotations

import asyncio
import os

import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ._idtoken import id_token_for
from .db import get_pool
from .proxy import AGENT_URL
from .stats import STATS_URL

router = APIRouter()

TOOLBOX_ENDPOINT = os.getenv("TOOLBOX_ENDPOINT", "http://mcp-toolbox:5000")


@router.get("/healthz", include_in_schema=False)
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


async def _check_db() -> None:
    pool = await get_pool()
    await pool.fetchval("SELECT 1")


async def _check_service(
    url: str, audience: str, *, auth_header: str = "authorization"
) -> None:
    """Reach an internal service the way the app does (ID token, matching
    audience). A DNS/endpoint misconfig raises a connect error; a bad
    token/invoker/audience comes back 401/403 — both fail the check. Any other
    status (200/404/…) means the hop is wired correctly."""
    token = id_token_for(audience)
    headers = {auth_header: f"Bearer {token}"} if token else {}
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=headers)
    if resp.status_code in (401, 403):
        raise RuntimeError(f"auth rejected ({resp.status_code})")
    if resp.status_code >= 500:
        raise RuntimeError(f"upstream error ({resp.status_code})")


@router.get("/healthz/deep", include_in_schema=False)
async def healthz_deep() -> JSONResponse:
    checks = {
        "db": _check_db(),
        "agents": _check_service(f"{AGENT_URL}/list-apps", AGENT_URL),
        "stats": _check_service(f"{STATS_URL}/health", STATS_URL),
        # The Toolbox reserves Authorization for its own auth, so its Cloud Run
        # IAM token rides X-Serverless-Authorization (see api/toolbox.py).
        "toolbox": _check_service(
            f"{TOOLBOX_ENDPOINT}/",
            TOOLBOX_ENDPOINT,
            auth_header="x-serverless-authorization",
        ),
    }
    results = await asyncio.gather(*checks.values(), return_exceptions=True)

    report: dict[str, str] = {}
    ok = True
    for name, result in zip(checks.keys(), results):
        if isinstance(result, BaseException):
            report[name] = f"FAIL: {result}"
            ok = False
        else:
            report[name] = "ok"
    return JSONResponse({"ok": ok, "checks": report}, status_code=200 if ok else 503)
