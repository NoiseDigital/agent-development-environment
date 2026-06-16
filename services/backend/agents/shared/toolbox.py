"""Shared MCP Toolbox client for agents that load Toolbox toolsets."""

import os

from toolbox_core import ToolboxSyncClient
from toolbox_core.protocol import Protocol

from shared.idtoken import id_token_for

DEFAULT_TOOLBOX_ENDPOINT = "https://mcp-toolbox-192748761045.us-central1.run.app"


def get_toolbox_client() -> ToolboxSyncClient:
    """A ToolboxSyncClient for the configured MCP Toolbox endpoint.

    Pinned to MCP protocol 2025-03-26: the Toolbox server speaks that, while the
    toolbox-core SDK defaults to 2025-06-18 — the mismatch otherwise errors.
    """
    endpoint = os.getenv("TOOLBOX_ENDPOINT", DEFAULT_TOOLBOX_ENDPOINT)
    # Authenticate to the internal-ingress Toolbox with a Google-signed ID token
    # (audience = its URL). Only on GCP — locally the endpoint is plain HTTP.
    client_headers = (
        {"Authorization": lambda: f"Bearer {id_token_for(endpoint)}"}
        if endpoint.startswith("https://")
        else None
    )
    return ToolboxSyncClient(
        endpoint,
        protocol=Protocol.MCP_v20250326,
        client_headers=client_headers,
    )
