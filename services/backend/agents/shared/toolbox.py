"""Shared MCP Toolbox client for agents that load Toolbox toolsets."""

import os

from toolbox_core import ToolboxSyncClient
from toolbox_core.protocol import Protocol

DEFAULT_TOOLBOX_ENDPOINT = "https://mcp-toolbox-192748761045.us-central1.run.app"


def get_toolbox_client() -> ToolboxSyncClient:
    """A ToolboxSyncClient for the configured MCP Toolbox endpoint.

    Pinned to MCP protocol 2025-03-26: the Toolbox server speaks that, while the
    toolbox-core SDK defaults to 2025-06-18 — the mismatch otherwise errors.
    """
    endpoint = os.getenv("TOOLBOX_ENDPOINT", DEFAULT_TOOLBOX_ENDPOINT)
    return ToolboxSyncClient(endpoint, protocol=Protocol.MCP_v20250326)
