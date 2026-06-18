"""Async MCP Toolbox client — used by the dashboards route.

Mirrors the agent service's `shared/toolbox.py` shape (one factory, one
endpoint, the same protocol pin) but uses the async `ToolboxClient` so a
dashboard's many parallel tile fetches don't serialise behind a sync client
blocking the event loop.

Result-shape note: MCP returns tool outputs as content items, and the
toolbox-core async client surfaces them as a list — sometimes a list of
dicts (one per row), sometimes a list with a single JSON-encoded string
containing the whole row set. `normalise_rows()` handles both, so callers
always receive a flat `list[dict]`.
"""

from __future__ import annotations

import json
import os
from typing import Any

from toolbox_core import ToolboxClient
from toolbox_core.protocol import Protocol

from ._idtoken import id_token_for

DEFAULT_TOOLBOX_ENDPOINT = "http://mcp-toolbox:5000"

# Lazy singleton — built on first use, shared by every request. Cheap to
# build but holding it pins the underlying HTTP pool, which we want.
_client: ToolboxClient | None = None


def get_toolbox_client() -> ToolboxClient:
    """Async ToolboxClient pinned to MCP protocol 2025-03-26 (the version the
    Toolbox server speaks). The newer 2025-06-18 default in toolbox-core
    errors against the server until it ships an update."""
    global _client
    if _client is None:
        endpoint = os.getenv("TOOLBOX_ENDPOINT", DEFAULT_TOOLBOX_ENDPOINT)
        # Authenticate to the internal-ingress Toolbox with a Google-signed ID
        # token (audience = its URL), refreshed per request via the callable.
        # Cloud Run's IAM token goes in X-Serverless-Authorization, NOT
        # Authorization, so it never collides with Toolbox's own bearer-token
        # auth (https://mcp-toolbox.dev/.../toolbox_mcp_auth). Only on GCP —
        # locally the endpoint is plain HTTP on the compose net.
        client_headers = (
            {"X-Serverless-Authorization": lambda: f"Bearer {id_token_for(endpoint)}"}
            if endpoint.startswith("https://")
            else None
        )
        _client = ToolboxClient(
            endpoint,
            protocol=Protocol.MCP_v20250326,
            client_headers=client_headers,
        )
    return _client


def normalise_rows(result: Any) -> list[dict[str, Any]]:
    """Coerce a toolbox tool's response into a flat list of row dicts.

    toolbox-core surfaces a tool's output in one of three shapes (varies by
    version + sync vs. async client):
      - a JSON-encoded STRING (whole row set in one MCP content item) — the
        async client's current shape;
      - a list[str] with one JSON-encoded element (older sync client);
      - a list[dict] (some versions pre-parse).
    Plus the trivial cases (None / a bare dict / a scalar).

    Output is always `list[dict]` with every cell coerced to its natural
    JS-friendly type. BigQuery serialises NUMERIC and BIGNUMERIC as JSON
    strings (to preserve precision), so a rate column like `ctr` arrives
    as `"0.022309"` — calling `.toFixed()` on that in the browser blows up.
    `_coerce_cell` flips numeric strings back to numbers; non-numeric
    strings (names, ISO dates) are left alone. Defence-in-depth: SQL
    `CAST(... AS FLOAT64)` is the primary fix, this catches the misses.
    """
    if result is None:
        return []
    if isinstance(result, dict):
        return [_coerce_row(result)]

    # Async client: a single JSON-encoded string.
    if isinstance(result, str):
        return _from_json_string(result)

    if not isinstance(result, list):
        return [{"value": _coerce_cell(result)}]

    # List path — flatten dicts / decode strings.
    rows: list[dict[str, Any]] = []
    for item in result:
        if isinstance(item, dict):
            rows.append(_coerce_row(item))
        elif isinstance(item, str):
            rows.extend(_from_json_string(item))
        else:
            rows.append({"value": _coerce_cell(item)})
    return rows


def _from_json_string(s: str) -> list[dict[str, Any]]:
    """Best-effort JSON decode for a single response string. A non-JSON
    string falls back to a `{value: ...}` row rather than being dropped."""
    try:
        parsed = json.loads(s)
    except json.JSONDecodeError:
        return [{"value": s}]
    if isinstance(parsed, list):
        return [
            _coerce_row(r) if isinstance(r, dict) else {"value": _coerce_cell(r)}
            for r in parsed
        ]
    if isinstance(parsed, dict):
        return [_coerce_row(parsed)]
    return [{"value": _coerce_cell(parsed)}]


def _coerce_row(row: dict[str, Any]) -> dict[str, Any]:
    """Coerce every cell in a row. See `_coerce_cell` for the policy."""
    return {k: _coerce_cell(v) for k, v in row.items()}


def _coerce_cell(v: Any) -> Any:
    """If `v` is a string that represents a finite number, return the number.
    Otherwise return `v` unchanged.

    Rules:
      - Empty string stays a string (otherwise it would coerce to 0).
      - A string that fully matches a decimal / scientific notation pattern
        AND parses to a finite float becomes a float.
      - ISO dates (`2024-01-31`), names, JSON booleans-as-strings (`"true"`),
        and anything else stay as-is. (`Number("2024-01-31")` is NaN, so the
        isfinite check naturally rejects them.)
    """
    if not isinstance(v, str):
        return v
    if v == "":
        return v
    # Quick reject for anything that obviously isn't a number — avoids the
    # cost of float() on every name / date field.
    if not _NUMERIC_RE.match(v):
        return v
    try:
        n = float(v)
    except TypeError, ValueError:
        return v
    if n != n or n in (float("inf"), float("-inf")):  # NaN / inf
        return v
    return n


import re  # noqa: E402

# Optional sign, digits, optional decimal, optional exponent. Strict enough
# to skip "2024-01-31" and "192.168.1.1" but accept "0.022309" and "-1.5e-3".
_NUMERIC_RE = re.compile(r"^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$")
