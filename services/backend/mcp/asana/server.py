import asyncio
import json
import os
from typing import Any

import httpx
import uvicorn
from dotenv import load_dotenv
from mcp import types as mcp_types
from mcp.server.lowlevel import Server
from mcp.server.sse import SseServerTransport
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route

load_dotenv()

ASANA_API_BASE = "https://app.asana.com/api/1.0"
TASK_OPT_FIELDS = (
    "name,completed,due_on,notes,permalink_url,assignee.name,projects.name"
)


async def asana_request(
    method: str,
    path: str,
    params: dict[str, Any] | None = None,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    token = os.environ.get("ASANA_ACCESS_TOKEN", "")
    if not token:
        raise RuntimeError("ASANA_ACCESS_TOKEN is not set")
    async with httpx.AsyncClient(
        base_url=ASANA_API_BASE,
        headers={"Authorization": f"Bearer {token}"},
        timeout=30.0,
    ) as client:
        response = await client.request(method, path, params=params, json=body)
        response.raise_for_status()
        return response.json()


async def default_workspace_gid() -> str:
    configured = os.environ.get("ASANA_WORKSPACE_GID", "")
    if configured:
        return configured
    result = await asana_request("GET", "/workspaces")
    workspaces = result.get("data", [])
    if not workspaces:
        raise RuntimeError("No Asana workspaces are visible to this token")
    return workspaces[0]["gid"]


async def get_me() -> dict[str, Any]:
    return await asana_request("GET", "/users/me")


async def list_workspaces() -> dict[str, Any]:
    return await asana_request("GET", "/workspaces")


async def list_projects(workspace_gid: str = "") -> dict[str, Any]:
    workspace = workspace_gid or await default_workspace_gid()
    return await asana_request("GET", "/projects", params={"workspace": workspace})


async def get_tasks(
    project_gid: str = "",
    assignee: str = "me",
    completed_since: str = "now",
) -> dict[str, Any]:
    params: dict[str, Any] = {"opt_fields": TASK_OPT_FIELDS}
    if completed_since:
        params["completed_since"] = completed_since
    if project_gid:
        params["project"] = project_gid
    else:
        params["assignee"] = assignee or "me"
        params["workspace"] = await default_workspace_gid()
    return await asana_request("GET", "/tasks", params=params)


async def get_task(task_gid: str) -> dict[str, Any]:
    return await asana_request(
        "GET", f"/tasks/{task_gid}", params={"opt_fields": TASK_OPT_FIELDS}
    )


async def create_task(
    name: str,
    project_gid: str = "",
    notes: str = "",
    due_on: str = "",
    assignee: str = "",
) -> dict[str, Any]:
    data: dict[str, Any] = {"name": name}
    if project_gid:
        data["projects"] = [project_gid]
    else:
        data["workspace"] = await default_workspace_gid()
        data["assignee"] = assignee or "me"
    if notes:
        data["notes"] = notes
    if due_on:
        data["due_on"] = due_on
    if assignee:
        data["assignee"] = assignee
    return await asana_request("POST", "/tasks", body={"data": data})


async def update_task(
    task_gid: str,
    name: str = "",
    notes: str = "",
    due_on: str = "",
    completed: bool | None = None,
) -> dict[str, Any]:
    data: dict[str, Any] = {}
    if name:
        data["name"] = name
    if notes:
        data["notes"] = notes
    if due_on:
        data["due_on"] = due_on
    if completed is not None:
        data["completed"] = completed
    return await asana_request("PUT", f"/tasks/{task_gid}", body={"data": data})


async def add_comment(task_gid: str, text: str) -> dict[str, Any]:
    return await asana_request(
        "POST", f"/tasks/{task_gid}/stories", body={"data": {"text": text}}
    )


TOOL_HANDLERS = {
    "get_me": get_me,
    "list_workspaces": list_workspaces,
    "list_projects": list_projects,
    "get_asana_tasks": get_tasks,
    "get_task": get_task,
    "create_task": create_task,
    "update_task": update_task,
    "add_comment": add_comment,
}

TOOL_SCHEMAS = [
    mcp_types.Tool(
        name="get_me",
        description="Get the Asana user that owns the access token.",
        inputSchema={"type": "object", "properties": {}},
    ),
    mcp_types.Tool(
        name="list_workspaces",
        description="List Asana workspaces visible to the access token.",
        inputSchema={"type": "object", "properties": {}},
    ),
    mcp_types.Tool(
        name="list_projects",
        description=(
            "List projects in an Asana workspace. Defaults to the configured "
            "or first visible workspace."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "workspace_gid": {
                    "type": "string",
                    "description": "Workspace GID. Optional.",
                },
            },
        },
    ),
    mcp_types.Tool(
        name="get_asana_tasks",
        description=(
            "List Asana tasks. Filters by project when project_gid is given, "
            "otherwise lists tasks assigned to the user in the default "
            "workspace. completed_since='now' returns only incomplete tasks."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "project_gid": {
                    "type": "string",
                    "description": "Project GID to list tasks from. Optional.",
                },
                "assignee": {
                    "type": "string",
                    "description": "Assignee user GID or 'me'. Optional.",
                },
                "completed_since": {
                    "type": "string",
                    "description": (
                        "ISO 8601 timestamp or 'now'. Tasks completed before "
                        "this time are excluded. Optional."
                    ),
                },
            },
        },
    ),
    mcp_types.Tool(
        name="get_task",
        description="Get full details for a single Asana task.",
        inputSchema={
            "type": "object",
            "properties": {
                "task_gid": {"type": "string", "description": "Task GID."},
            },
            "required": ["task_gid"],
        },
    ),
    mcp_types.Tool(
        name="create_task",
        description=(
            "Create an Asana task. Adds it to a project when project_gid is "
            "given, otherwise creates it in the default workspace assigned "
            "to the user."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Task name."},
                "project_gid": {
                    "type": "string",
                    "description": "Project GID to add the task to. Optional.",
                },
                "notes": {
                    "type": "string",
                    "description": "Task description. Optional.",
                },
                "due_on": {
                    "type": "string",
                    "description": "Due date as YYYY-MM-DD. Optional.",
                },
                "assignee": {
                    "type": "string",
                    "description": "Assignee user GID or 'me'. Optional.",
                },
            },
            "required": ["name"],
        },
    ),
    mcp_types.Tool(
        name="update_task",
        description=(
            "Update an Asana task's name, notes, due date, or completion "
            "state. Only provided fields are changed."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "task_gid": {"type": "string", "description": "Task GID."},
                "name": {"type": "string", "description": "New name. Optional."},
                "notes": {
                    "type": "string",
                    "description": "New description. Optional.",
                },
                "due_on": {
                    "type": "string",
                    "description": "New due date as YYYY-MM-DD. Optional.",
                },
                "completed": {
                    "type": "boolean",
                    "description": "Mark complete or incomplete. Optional.",
                },
            },
            "required": ["task_gid"],
        },
    ),
    mcp_types.Tool(
        name="add_comment",
        description="Add a comment to an Asana task.",
        inputSchema={
            "type": "object",
            "properties": {
                "task_gid": {"type": "string", "description": "Task GID."},
                "text": {"type": "string", "description": "Comment text."},
            },
            "required": ["task_gid", "text"],
        },
    ),
]

app = Server("asana-mcp-server")
sse = SseServerTransport("/messages/")


@app.list_tools()
async def list_tools() -> list[mcp_types.Tool]:
    return TOOL_SCHEMAS


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[mcp_types.TextContent]:
    handler = TOOL_HANDLERS.get(name)
    if handler is None:
        error_text = json.dumps({"error": f"Tool '{name}' not implemented."})
        return [mcp_types.TextContent(type="text", text=error_text)]
    try:
        result = await handler(**arguments)
        return [mcp_types.TextContent(type="text", text=json.dumps(result, indent=2))]
    except httpx.HTTPStatusError as e:
        error_text = json.dumps(
            {
                "error": f"Asana API returned {e.response.status_code}",
                "detail": e.response.text,
            }
        )
        return [mcp_types.TextContent(type="text", text=error_text)]
    except Exception as e:
        error_text = json.dumps({"error": f"Failed to execute tool '{name}': {e}"})
        return [mcp_types.TextContent(type="text", text=error_text)]


async def handle_sse(request):
    async with sse.connect_sse(
        request.scope, request.receive, request._send
    ) as streams:
        await app.run(streams[0], streams[1], app.create_initialization_options())


async def handle_get_tasks(request: Request) -> JSONResponse:
    project_id = request.query_params.get("project_id", "")
    completed_since = request.query_params.get("completed_since", "now")
    try:
        result = await get_tasks(
            project_gid=project_id, completed_since=completed_since
        )
        return JSONResponse(result)
    except httpx.HTTPStatusError as e:
        return JSONResponse(
            {"error": e.response.text}, status_code=e.response.status_code
        )
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


starlette_app = Starlette(
    routes=[
        Route("/sse", endpoint=handle_sse),
        Route("/get_tasks", endpoint=handle_get_tasks),
        Mount("/messages/", app=sse.handle_post_message),
    ],
)

if __name__ == "__main__":
    host = os.environ.get("APP_HOST", "0.0.0.0")
    port = int(os.environ.get("APP_PORT", 8081))
    print(f"Launching Asana MCP Server on {host}:{port} (sse)...")
    try:
        asyncio.run(uvicorn.run(starlette_app, host=host, port=port))
    except KeyboardInterrupt:
        print("\nMCP Server stopped by user.")
    finally:
        print("MCP Server process exiting.")
