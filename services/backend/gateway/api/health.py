"""Liveness probe — used by compose's `depends_on` and Cloud Run.

Deliberately dependency-free so the container stays green even when a downstream
wobbles (a liveness probe that checks the DB would get the container killed on a
transient blip). Deeper, cross-service verification belongs in the post-deploy
smoke test against the REAL request path (and, for authenticated hops, an
authenticated smoke) — not a public unauthenticated endpoint that pings internal
services and leaks topology.
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.get("/healthz", include_in_schema=False)
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
