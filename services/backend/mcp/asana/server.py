"""
MCP server for Asana tools.
"""

import asyncio
import json
import os
import uvicorn
from dotenv import load_dotenv
from typing import Dict, Any

from mcp import types as mcp_types
from mcp.server.lowlevel import Server
from mcp.server.sse import SseServerTransport
from starlette.applications import Starlette
from starlette.routing import Mount, Route

from google.adk.tools.function_tool import FunctionTool
from google.adk.tools.mcp_tool.conversion_utils import adk_to_mcp_tool_type


# --- Define ADK tools ---
def get_asana_tasks(
    project_id: str = "",
    completed_since: str = "now",
) -> Dict[str, Any]:
    """Mock function to retrieve Asana tasks associated with a user, with docket/project IDs in the task name."""
    print(f"Mock Asana MCP: Received request for project_id: {project_id}")
    tasks = [
        {
            "id": "1234567890",
            "name": "Prepare project report [P002-EPSON]",
            "completed": False,
            "project_id": project_id or "P002-EPSON",
            "due_on": "2025-06-20",
            "hours_worked": 2.5,
        },
        {
            "id": "0987654321",
            "name": "Review pull requests [P003-ACME]",
            "completed": True,
            "project_id": project_id or "P003-ACME",
            "due_on": "2025-06-15",
            "hours_worked": 1.5,
        },
        {
            "id": "1122334455",
            "name": "Finalize budget [P004-XYZ]",
            "completed": False,
            "project_id": project_id or "P004-XYZ",
            "due_on": "2025-06-22",
            "hours_worked": 1.0,
        },
    ]
    return {
        "data": tasks,
        "completed_since": completed_since,
        "project_id": project_id,
    }


asana_tool = FunctionTool(get_asana_tasks)

available_tools = {
    asana_tool.name: asana_tool,
}

# --- MCP Server Setup ---
app = Server("adk-tool-mcp-server")
sse = SseServerTransport("/messages/")


@app.list_tools()
async def list_tools() -> list[mcp_types.Tool]:
    """MCP handler to list available tools."""
    mcp_tool_schema_asana = adk_to_mcp_tool_type(asana_tool)
    print(
        f"""MCP Server: Received list_tools request.
MCP Server: Advertising tool: {mcp_tool_schema_asana.name}"""
    )
    return [mcp_tool_schema_asana]


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[mcp_types.TextContent]:
    """MCP handler to execute a tool call."""
    print(f"MCP Server: Received call_tool request for '{name}' with args: {arguments}")
    tool_to_call = available_tools.get(name)
    if tool_to_call:
        try:
            adk_response = await tool_to_call.run_async(
                args=arguments,
                tool_context=None,
            )
            print(f"MCP Server: ADK tool '{name}' executed successfully.")
            response_text = json.dumps(adk_response, indent=2)
            return [mcp_types.TextContent(type="text", text=response_text)]
        except Exception as e:
            print(f"MCP Server: Error executing ADK tool '{name}': {e}")
            error_text = json.dumps(
                {"error": f"Failed to execute tool '{name}': {str(e)}"}
            )
            return [mcp_types.TextContent(type="text", text=error_text)]
    else:
        print(f"MCP Server: Tool '{name}' not found.")
        error_text = json.dumps({"error": f"Tool '{name}' not implemented."})
        return [mcp_types.TextContent(type="text", text=error_text)]


# --- MCP Remote Server ---
async def handle_sse(request):
    """Runs the MCP server over SSE."""
    async with sse.connect_sse(
        request.scope, request.receive, request._send
    ) as streams:
        await app.run(streams[0], streams[1], app.create_initialization_options())


starlette_app = Starlette(
    debug=True,
    routes=[
        Route("/sse", endpoint=handle_sse),
        Mount("/messages/", app=sse.handle_post_message),
    ],
)

if __name__ == "__main__":
    load_dotenv()
    host = os.environ.get("APP_HOST", "0.0.0.0")
    port = int(os.environ.get("APP_PORT", 8081))
    print(f"Launching MCP Server exposing ADK tools on {host}:{port} (sse)...")
    try:
        asyncio.run(uvicorn.run(starlette_app, host=host, port=port))
    except KeyboardInterrupt:
        print("\nMCP Server stopped by user.")
    except Exception as e:
        print(f"MCP Server encountered an error: {e}")
    finally:
        print("MCP Server process exiting.")
