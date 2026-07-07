"""Agent platform backend — the ADK FastAPI app plus the platform's own API."""

import logging
import os
from pathlib import Path

import uvicorn
from google.adk.cli.fast_api import get_fast_api_app
from google.adk.cli.utils.agent_loader import AgentLoader

# Note: session naming + dashboard insights are no longer custom routes that
# build their own genai.Client. They are now real ADK agents (the
# `session_naming_agent` and `dashboard_insights_agent` apps under adk_agents/),
# invoked by the frontend through the standard ADK /run endpoint. ONE auth
# path — ADK + ADC — for every model interaction in the platform.


class _MuteLivenessAccessLog(logging.Filter):
    """Drop zero-signal poll access lines: the orchestrator's `GET /healthz`
    liveness probe and the frontend's `GET /list-apps` agent-liveness poll —
    both high-frequency, no signal; a real failure shows via the unhealthy
    container + app error log. Narrow: every other route + their failures stay."""

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return '"GET /healthz HTTP' not in msg and '"GET /list-apps HTTP' not in msg


logging.getLogger("uvicorn.access").addFilter(_MuteLivenessAccessLog())

AGENTS_DIR = str(Path(__file__).resolve().parent / "adk_agents")


class _AllowlistAgentLoader(AgentLoader):
    """Restrict the ADK runtime to a tenant's enabled agents.

    A tenant sets ENABLED_AGENTS to its enabled modules' agents (a comma list),
    or to "*" for the full platform. `list_agents()` gates discovery (/list-apps
    and the dev UI, which derives its list from it); `load_agent()` enforces it
    so a disabled agent can't be reached by name either. There is no default
    tenant: ENABLED_AGENTS must be set — an unset value is a config error, not a
    silent "load everything"."""

    def __init__(self, agents_dir: str, allowed: set[str]) -> None:
        super().__init__(agents_dir)
        self._allowed = frozenset(allowed)

    def list_agents(self) -> list[str]:
        return [name for name in super().list_agents() if name in self._allowed]

    def load_agent(self, agent_name: str):
        if agent_name not in self._allowed:
            raise ValueError(f"Agent '{agent_name}' is not enabled for this tenant")
        return super().load_agent(agent_name)


# Every tenant declares its agent allowlist via ENABLED_AGENTS (set by Terraform
# / start_services from the module catalog): "*" = full platform, a comma list =
# that subset. No default tenant — an unset/empty value is a configuration error
# we fail on, never a silent "load everything".
_raw_enabled = os.environ.get("ENABLED_AGENTS", "").strip()
if not _raw_enabled:
    raise RuntimeError(
        "ENABLED_AGENTS is not set. Every tenant must declare its agent allowlist "
        '("*" for the full platform, or a comma-separated subset). No tenant is the default.'
    )
if _raw_enabled == "*":
    _agent_loader = None  # full platform — the default AgentLoader loads every agent
else:
    _enabled_agents = {a.strip() for a in _raw_enabled.split(",") if a.strip()}
    _agent_loader = _AllowlistAgentLoader(AGENTS_DIR, _enabled_agents)

# ADK's artifact service handles CONTEXTUAL files within a chat — files a user
# attaches to a message, and files an agent generates during a turn (read/written
# via context.load_artifact / save_artifact). Backed by GCS in prod
# (gs://<bucket>) and the local filesystem in dev (ADK uses its local artifact
# service when the URI is None). This is distinct from the platform's data
# "sources" (user-uploaded analysis files, outside chat), which the gateway owns.
_gcs_bucket = os.environ.get("GCS_BUCKET")
app = get_fast_api_app(
    agents_dir=AGENTS_DIR,
    agent_loader=_agent_loader,
    session_service_uri=os.environ.get("DATABASE_URL"),
    artifact_service_uri=f"gs://{_gcs_bucket}" if _gcs_bucket else None,
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "http://localhost").split(","),
    web=True,
    trace_to_cloud=False,
)

# The platform's CRUD API (sources, pins, feedback, session metadata, dashboard
# query, toolbox catalog) now lives entirely in the gateway, beside the Postgres
# schema it owns (Alembic). This service is the ADK runtime only. See
# services/backend/gateway/api/.


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
