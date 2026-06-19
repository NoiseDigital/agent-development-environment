"""MCP toolbox query catalog (admin).

Reconstructs the SQL a bigquery-sql tool call executed by pairing the call's args
with the statement in the toolbox config (tools.yaml) — the call itself never
carries the statement. Moved here from the agents service: it's a platform BFF
concern, not part of the ADK runtime.

tools.yaml lives with the toolbox image, not this source, so it's mounted
read-only into the gateway container (see docker-compose.yml). A missing/
unreadable config yields an empty catalog — the feature degrades to "no queries
shown" (which is already the case in prod, where no config is mounted).
"""

from __future__ import annotations

import os
from pathlib import Path

import yaml
from fastapi import APIRouter

# Unversioned to match the path the frontend already calls (it used to fall
# through the gateway proxy to the agent); mounted before the catch-all proxy.
router = APIRouter(prefix="/api", tags=["tools"])

# Where docker-compose mounts services/backend/mcp/images/toolbox.
DEFAULT_CONFIG_PATH = "/toolbox-config/tools.yaml"


def _config_path() -> Path:
    return Path(os.getenv("TOOLBOX_CONFIG_PATH", DEFAULT_CONFIG_PATH))


def load_catalog() -> dict[str, dict]:
    """Return ``{ tool_name: { statement, params } }`` for every bigquery-sql tool.

    `params` carries each parameter's `default`, so the UI can fill in the
    arguments the agent omitted — matching what genai-toolbox actually binds.
    """
    try:
        raw = _config_path().read_text()
    except OSError:
        return {}

    catalog: dict[str, dict] = {}
    for doc in yaml.safe_load_all(raw):
        if not isinstance(doc, dict):
            continue
        if doc.get("kind") != "tool" or doc.get("type") != "bigquery-sql":
            continue
        name, statement = doc.get("name"), doc.get("statement")
        if not name or not statement:
            continue
        params = [
            {"name": p["name"], "default": p.get("default")}
            for p in (doc.get("parameters") or [])
            if isinstance(p, dict) and p.get("name")
        ]
        catalog[name] = {"statement": str(statement).strip(), "params": params}
    return catalog


@router.get("/tools/catalog")
async def tools_catalog():
    """Name → { statement, params } for every bigquery-sql toolbox tool."""
    return {"tools": load_catalog()}
