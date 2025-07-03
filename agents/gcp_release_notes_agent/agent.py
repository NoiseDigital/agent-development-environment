from google.adk.agents import Agent
from toolbox_core import ToolboxSyncClient

# NOTE: This agent cannot be deployed to Agent Engine, as ToolboxSyncClient cannot be pickled
# Local, after starting toolbox server from tools/mcp-toolbox/: ./toolbox --tools-file "tools.yaml --port 8080"
# TOOLBOX_ENDPOINT = "http://localhost:8080"

# Remote URL (deployed Cloud Run MCP Toolbox)
TOOLBOX_ENDPOINT = "https://mcp-toolbox-192748761045.us-central1.run.app"

toolbox = ToolboxSyncClient(TOOLBOX_ENDPOINT)
tools = toolbox.load_toolset("public_bq_toolset")

root_agent = Agent(
    name="gcp_releasenotes_agent",
    model="gemini-2.0-flash",
    description="Summarize GCP Release Notes",
    instruction="You are a helpful agent who can answer user questions about GCP Release Notes. Use the tools to answer the question. Give your answers in a mix of text insights and markdown formatted tables.",
    tools=tools,
)