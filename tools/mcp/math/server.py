import asyncio
import json
import os
import uvicorn
from dotenv import load_dotenv

from mcp import types as mcp_types
from mcp.server.lowlevel import Server
from mcp.server.sse import SseServerTransport
from starlette.applications import Starlette
from starlette.routing import Mount, Route

from google.adk.tools.function_tool import FunctionTool
from google.adk.tools.mcp_tool.conversion_utils import adk_to_mcp_tool_type

# --- Define ADK tools ---
def add(a: int, b: int) -> int:
    """Use this to add two numbers together."""
    return a + b

def subtract(a: int, b: int) -> int:
    """Use this to subtract two numbers."""
    return a - b

add_tool = FunctionTool(add)
subtract_tool = FunctionTool(subtract)

available_tools = {
    add_tool.name: add_tool,
    subtract_tool.name: subtract_tool,
}

# --- MCP Server Setup ---
app = Server("adk-tool-mcp-server")
sse = SseServerTransport("/messages/")

@app.list_tools()
async def list_tools() -> list[mcp_types.Tool]:
    """MCP handler to list available tools."""
    mcp_tool_schema_add = adk_to_mcp_tool_type(add_tool)
    mcp_tool_schema_subtract = adk_to_mcp_tool_type(subtract_tool)
    print(f"MCP Server: Received list_tools request.\nMCP Server: Advertising tool: {mcp_tool_schema_add.name} and {mcp_tool_schema_subtract.name}")
    return [mcp_tool_schema_add, mcp_tool_schema_subtract]


@app.call_tool()
async def call_tool(
    name: str, arguments: dict
) -> list[mcp_types.TextContent]:
    """MCP handler to execute a tool call."""
    print(f"MCP Server: Received call_tool request for '{name}' with args: {arguments}")
    tool_to_call = available_tools.get(name)
    if tool_to_call:
        try:
            adk_response = await tool_to_call.run_async(
                args=arguments,
                tool_context=None,  # No ADK context available here
            )
            print(f"MCP Server: ADK tool '{name}' executed successfully.")
            response_text = json.dumps(adk_response, indent=2)
            return [mcp_types.TextContent(type="text", text=response_text)]
        except Exception as e:
            print(f"MCP Server: Error executing ADK tool '{name}': {e}")
            error_text = json.dumps({"error": f"Failed to execute tool '{name}': {str(e)}"})
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
        await app.run(
            streams[0], streams[1], app.create_initialization_options()
        )

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
    port = int(os.environ.get("APP_PORT", 8080))
    print(f"Launching MCP Server exposing ADK tools on {host}:{port} (sse)...")
    try:
        asyncio.run(uvicorn.run(starlette_app, host=host, port=port))
    except KeyboardInterrupt:
        print("\nMCP Server stopped by user.")
    except Exception as e:
        print(f"MCP Server encountered an error: {e}")
    finally:
        print("MCP Server process exiting.")