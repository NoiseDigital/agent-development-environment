"""NoiseOS gateway entry point.

Public surface of the backend. Mounts:
- `/healthz` — liveness probe.
- `/api/dashboards/query` — async pass-through to the MCP Toolbox; parses
  the toolbox's MCP-shaped response into flat row dicts.
- `/api/clients` — platform client directory backed by Postgres.
- `/*` — catch-all proxy to the private agent service for everything else
  (ADK `/run_sse`, sessions, session-metadata, event-metadata, sources,
  pins, etc). MUST be mounted last so it doesn't shadow the routes above.

CORS is permissive in dev (the frontend runs on localhost:3000); tighten via
the ALLOWED_ORIGINS env var when deploying.
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.clients import router as clients_router
from api.dashboards import router as dashboards_router
from api.health import router as health_router
from api.proxy import router as proxy_router

app = FastAPI(title="NoiseOS Gateway", version="0.1.0")

origins = [
    o.strip()
    for o in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost,http://localhost:3000,http://frontend:3000",
    ).split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Order matters — the proxy is a catch-all and must be the LAST router added,
# so explicit gateway-owned routes match before falling through to the agent.
app.include_router(health_router)
app.include_router(dashboards_router)
app.include_router(clients_router)
app.include_router(proxy_router)
