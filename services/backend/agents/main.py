"""Agent platform backend — the ADK FastAPI app plus the platform's own API."""

import logging
import os
from pathlib import Path

import uvicorn
from google.adk.cli.fast_api import get_fast_api_app

from api.pins.routes import router as pins_router
from api.sources.routes import router as sources_router
from api.events.routes import router as events_router
from api.sessions.routes import router as sessions_router
from api.tools.routes import router as tools_router
# Note: session naming + dashboard insights are no longer custom routes that
# build their own genai.Client. They are now real ADK agents (the
# `session_naming_agent` and `dashboard_insights_agent` apps under adk_agents/),
# invoked by the frontend through the standard ADK /run endpoint. ONE auth
# path — ADK + ADC — for every model interaction in the platform.


class _MuteLivenessAccessLog(logging.Filter):
    """Drop ONLY the exact liveness-probe access line (`GET /healthz`), which the
    orchestrator hits every few seconds with zero signal. Precise on purpose:
    `/list-apps`, every real route, and any non-2xx on `/healthz` stay visible."""

    def filter(self, record: logging.LogRecord) -> bool:
        return '"GET /healthz HTTP' not in record.getMessage()


logging.getLogger("uvicorn.access").addFilter(_MuteLivenessAccessLog())

AGENTS_DIR = str(Path(__file__).resolve().parent / "adk_agents")

app = get_fast_api_app(
    agents_dir=AGENTS_DIR,
    session_service_uri=os.environ.get("DATABASE_URL"),
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "http://localhost").split(","),
    web=True,
    trace_to_cloud=False,
)

# Platform API — everything ADK's FastAPI app doesn't already provide.
app.include_router(sources_router)  # uploads + BigQuery catalog
app.include_router(events_router)  # per-message event metadata
app.include_router(sessions_router)  # session display names
app.include_router(tools_router)  # MCP toolbox query catalog (admin)
# Dashboard query route moved to the gateway — it's a platform-owned BFF
# concern, not part of the ADK runtime. See services/backend/gateway/api/dashboards.py.
app.include_router(pins_router)  # pinned charts (FloatingAssistant → dashboard)


# Liveness probe — kept independent of any DB / model dependency so the
# Cloud Run container health check stays green even if a downstream is
# misbehaving. The gateway has its own /healthz; this exists so the agent
# service can be probed directly (private ingress) without going through
# the gateway, and so docker-compose's healthcheck has a stable target.
@app.get("/healthz", include_in_schema=False)
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
