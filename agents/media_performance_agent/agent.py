from google.adk.agents import Agent
from toolbox_core import ToolboxSyncClient

# NOTE: This agent cannot be deployed to Agent Engine, as ToolboxSyncClient cannot be pickled
# Local, after starting toolbox server from tools/mcp-toolbox/: ./toolbox --tools-file "tools.yaml --port 8080"
# TOOLBOX_ENDPOINT = "http://localhost:8080"

# Remote URL (deployed Cloud Run MCP Toolbox)
TOOLBOX_ENDPOINT = "https://toolbox-192748761045.us-central1.run.app"

toolbox = ToolboxSyncClient(TOOLBOX_ENDPOINT)
tools = toolbox.load_toolset("media_performance_toolset")

root_agent = Agent(
    name="media_performance_agent",
    model="gemini-2.0-flash",
    description="Agent to answer questions about Media Performance.",
    instruction="You are a helpful agent who can answer user questions about campaign media performance. Use the tools to answer the question. Give your answers in a mix of text insights and markdown formatted tables.",
    tools=tools,
)