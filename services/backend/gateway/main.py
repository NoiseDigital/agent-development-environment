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

from fastapi import APIRouter, FastAPI

from api.access import router as access_router
from api.clients import router as clients_router
from api.dashboards import router as dashboards_router
from api.health import router as health_router
from api.me import router as me_router
from api.proxy import router as proxy_router
from api.stats import router as stats_router
from api.users import router as users_router

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

# The platform's versioned JSON API. The version lives in ONE place (this
# parent prefix), so bumping to v2 — or mounting v1 and v2 side by side during a
# migration window — is a single change here, not a rename across every router.
api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(dashboards_router)
api_v1.include_router(stats_router)
api_v1.include_router(clients_router)
api_v1.include_router(me_router)

# Order matters — the proxy is a catch-all and must be the LAST router added,
# so explicit gateway-owned routes match before falling through to the agent.
# `/healthz` and the agent passthrough are deliberately UNVERSIONED.
app.include_router(health_router)
app.include_router(api_v1)
app.include_router(proxy_router)
