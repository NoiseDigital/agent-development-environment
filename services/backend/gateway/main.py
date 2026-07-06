"""NoiseOS gateway entry point.

Public surface of the backend. The platform's own JSON API is versioned under
`/api/v1` (URL-path versioning — the version lives in one parent prefix, so a
future `/api/v2` is an additive change, never a rename). Mounts:
- `/healthz` — liveness probe. UNVERSIONED — a stable path for Cloud Run / LB
  health checks that must not move when the API version bumps.
- `/api/v1/dashboards/query` — async pass-through to the MCP Toolbox; parses
  the toolbox's MCP-shaped response into flat row dicts.
- `/api/v1/stats/{endpoint}` — proxy to the mcp-stats service (correlate / qa /
  describe). Stops the frontend from needing direct network access to a
  service that lives behind internal-only ingress in production.
- `/api/v1/clients` — platform client directory backed by Postgres.
- `/*` — catch-all proxy to the private agent service for everything else
  (ADK `/run_sse`, sessions, session-metadata, event-metadata, sources,
  pins, etc). UNVERSIONED — the agent runtime owns its own contract. MUST be
  mounted last so it doesn't shadow the routes above.

No CORS: the browser only ever calls the same-origin Next.js BFF (`/gw`), which
proxies here server-side; in prod the gateway is internal-ingress + IAM, so no
browser reaches it directly. There is no cross-origin caller to allow.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, FastAPI

from api.access.routes import router as access_router
from api.clients.routes import router as clients_router
from api.dashboards.routes import router as dashboards_router
from api.events.routes import router as events_router
from api.health import router as health_router
from api.me.routes import router as me_router
from api.pins.routes import router as pins_router
from api.proxy import router as proxy_router
from api.sessions.routes import router as sessions_router
from api.sources.routes import router as sources_router
from api.stats.routes import router as stats_router
from api.tools.routes import router as tool_catalog_router
from api.users.routes import router as users_router


class _MuteLivenessAccessLog(logging.Filter):
    """Drop zero-signal poll access lines: the orchestrator's `GET /healthz`
    liveness probe and the frontend's `GET /list-apps` agent-liveness poll (the
    AppsProvider hits it on a 15s timer). Both are high-frequency and carry no
    signal — a real failure surfaces via the unhealthy container + app error
    log. Narrow on purpose: every other route and their failures stay visible."""

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return '"GET /healthz HTTP' not in msg and '"GET /list-apps HTTP' not in msg


logging.getLogger("uvicorn.access").addFilter(_MuteLivenessAccessLog())

app = FastAPI(title="NoiseOS Gateway", version="0.1.0")

# The platform's versioned JSON API. The version lives in ONE place (this
# parent prefix), so bumping to v2 — or mounting v1 and v2 side by side during a
# migration window — is a single change here, not a rename across every router.
api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(dashboards_router)
api_v1.include_router(stats_router)
api_v1.include_router(clients_router)
api_v1.include_router(me_router)
api_v1.include_router(users_router)
api_v1.include_router(access_router)

# Platform CRUD migrated out of the agents service (the schema lives here, in
# Alembic). These keep the UNVERSIONED `/api/...` paths the frontend already
# calls — they used to fall through the proxy to the agent; now the gateway
# serves them directly. Mounted AFTER api_v1 and BEFORE the proxy so they
# intercept instead of proxying. (Versioning under /api/v1 is a separate,
# additive change — intentionally not coupled to this migration.)
platform = APIRouter()
platform.include_router(tool_catalog_router)
platform.include_router(pins_router)
platform.include_router(events_router)
platform.include_router(sessions_router)
platform.include_router(sources_router)

# Order matters — the proxy is a catch-all and must be the LAST router added,
# so explicit gateway-owned routes match before falling through to the agent.
# `/healthz` and the agent passthrough are deliberately UNVERSIONED.
app.include_router(health_router)
app.include_router(api_v1)
app.include_router(platform)
app.include_router(proxy_router)
