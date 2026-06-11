"""Builds a name → SQL catalog from the MCP toolbox config (tools.yaml).

A tool call only carries a tool name and arguments — never the SQL. The toolbox
config is the source of truth for the statement each bigquery-sql tool runs, so
the UI reconstructs "what executed" by pairing a call's args with the statement
from here.

tools.yaml lives with the toolbox image, not the agent source, so it is mounted
read-only into this container (see docker-compose.yml). A missing/unreadable
config yields an empty catalog — the feature degrades to "no queries shown".
"""

from __future__ import annotations

import os
from pathlib import Path

import yaml

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
