"""Shared MCP Toolbox client for agents that load Toolbox toolsets."""

import os

from toolbox_core import ToolboxSyncClient
from toolbox_core.protocol import Protocol

from shared.idtoken import id_token_for

# Local-compose fallback only. Every deployed env supplies TOOLBOX_ENDPOINT via
# Terraform (local.run_url["mcp-toolbox"]), so this default is never used in the
# cloud. It must NOT be a real tenant URL — a hardcoded prod endpoint here would
# make any tenant that ran without the env silently call another tenant's
# Toolbox. Mirrors the gateway's local default (services/backend/gateway/api/toolbox.py).
DEFAULT_TOOLBOX_ENDPOINT = "http://mcp-toolbox:5000"


def get_toolbox_client() -> ToolboxSyncClient:
    """A ToolboxSyncClient for the configured MCP Toolbox endpoint.

    Pinned to MCP protocol 2025-03-26: the Toolbox server speaks that, while the
    toolbox-core SDK defaults to 2025-06-18 — the mismatch otherwise errors.
    """
    endpoint = os.getenv("TOOLBOX_ENDPOINT", DEFAULT_TOOLBOX_ENDPOINT)
    # Authenticate to the internal-ingress Toolbox with a Google-signed ID token
    # (audience = its URL). Cloud Run's IAM token goes in X-Serverless-Authorization,
    # NOT Authorization, so it never collides with Toolbox's own bearer-token auth
    # (https://mcp-toolbox.dev/.../toolbox_mcp_auth). Only on GCP — locally the
    # endpoint is plain HTTP.
    client_headers = (
        {"X-Serverless-Authorization": lambda: f"Bearer {id_token_for(endpoint)}"}
        if endpoint.startswith("https://")
        else None
    )
    return ToolboxSyncClient(
        endpoint,
        protocol=Protocol.MCP_v20250326,
        client_headers=client_headers,
    )
