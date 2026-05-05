import os
from google.adk.agents import Agent
from toolbox_core import ToolboxSyncClient
from toolbox_core.protocol import Protocol

# NOTE: This agent cannot be deployed to Agent Engine, as ToolboxSyncClient cannot be pickled
# Local, after starting toolbox server from tools/mcp-toolbox/: ./toolbox --tools-file "tools.yaml --port 8080"
# TOOLBOX_ENDPOINT = "http://localhost:8080"

# Remote URL (deployed Cloud Run MCP Toolbox)
TOOLBOX_ENDPOINT = os.getenv("TOOLBOX_ENDPOINT", "https://mcp-toolbox-192748761045.us-central1.run.app")

# MCP Toolbox server v1.1.0 speaks protocol 2025-03-26. The toolbox-core SDK defaults
# to 2025-06-18, causing a version mismatch error. Pin to MCP_v20250326 until the
# server is upgraded to a version that supports a newer protocol.
toolbox = ToolboxSyncClient(TOOLBOX_ENDPOINT, protocol=Protocol.MCP_v20250326)
tools = toolbox.load_toolset("public_bq_toolset")

root_agent = Agent(
    name="gcp_releasenotes_agent",
    model="gemini-2.5-flash",
    description="Summarize GCP Release Notes",
    instruction="You are a helpful agent who can answer user questions about GCP Release Notes. Use the tools to answer the question. Give your answers in a mix of text insights and markdown formatted tables.",
    tools=tools,
)