from google.adk.agents.llm_agent import LlmAgent
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset
from google.adk.tools.mcp_tool.mcp_session_manager import SseConnectionParams

# Local URL (after running cd tools/mcp-on-cloudrun python server.py)
# MCP_SERVER_URL = "http://0.0.0.0:8080/sse"

# Remote URL (deployed Cloud Run MCP Toolbox)
MCP_SERVER_URL = "https://mcp-server-192748761045.us-central1.run.app/sse"

# NOTE: Must set errlog=None to deploy to Agent Engine
tools = MCPToolset(
    connection_params=SseConnectionParams(
        url=MCP_SERVER_URL
    ),
    errlog=None
)

root_agent = LlmAgent(
    model='gemini-2.0-flash',
    name='math_agent',
    instruction="""
        You do math with tools
      """,
    tools=[tools],
)
