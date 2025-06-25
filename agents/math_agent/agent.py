from google.adk.agents.llm_agent import LlmAgent
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset
from google.adk.tools.mcp_tool.mcp_session_manager import SseConnectionParams

# NOTE: This agent cannot be deployed to Agent Engine, as MCPToolset cannot be pickled
# Local URL (after running cd tools/mcp-on-cloudrun python server.py)
# MCP_SERVER_URL = "http://0.0.0.0:8080/sse"

# Remote URL (deployed Cloud Run MCP Toolbox)
MCP_SERVER_URL = "https://mcp-server-192748761045.us-central1.run.app/sse"


root_agent = LlmAgent(
    model='gemini-2.0-flash',
    name='math_agent',
    instruction="""
        You do math with tools
      """,
    tools=[
        MCPToolset(
            connection_params=SseConnectionParams(
                url=MCP_SERVER_URL
            )
        )
    ],
)
