import datetime
import json
import os
from typing import Any
from xml.sax.saxutils import escape

import httpx
import uvicorn
from dotenv import load_dotenv
from mcp import types as mcp_types
from mcp.server.lowlevel import Server
from mcp.server.sse import SseServerTransport
from starlette.applications import Starlette
from starlette.routing import Mount, Route

load_dotenv()

MOCK_MODE = os.environ.get("INTACCT_MOCK_MODE", "true").lower() == "true"

MOCK_PROJECTS: list[dict[str, Any]] = [
    {
        "project_id": "P002-EPSON",
        "project_name": "Epson Brand Campaign 2026",
        "customer_id": "CUST-EPSON",
        "customer_name": "Epson America",
        "status": "active",
        "tasks": [
            {
                "task_id": "TSK-001",
                "task_key": "1001",
                "task_name": "Creative Strategy & Planning",
                "billable": True,
            },
            {
                "task_id": "TSK-002",
                "task_key": "1002",
                "task_name": "Asset Production & Editing",
                "billable": True,
            },
        ],
    },
    {
        "project_id": "P003-ACME",
        "project_name": "Acme Marketing Platform",
        "customer_id": "CUST-ACME",
        "customer_name": "Acme Corp",
        "status": "active",
        "tasks": [
            {
                "task_id": "TSK-010",
                "task_key": "2001",
                "task_name": "Full Stack Development",
                "billable": True,
            },
            {
                "task_id": "TSK-011",
                "task_key": "2002",
                "task_name": "Architecture & Code Review",
                "billable": True,
            },
        ],
    },
    {
        "project_id": "P004-INTERNAL",
        "project_name": "Internal Non-Billable Operations",
        "customer_id": "CUST-INTERNAL",
        "customer_name": "Internal",
        "status": "active",
        "tasks": [
            {
                "task_id": "TSK-999",
                "task_key": "9001",
                "task_name": "General Administration & Meetings",
                "billable": False,
            }
        ],
    },
]

_mock_timesheets: dict[str, dict[str, Any]] = {}
_mock_sequence = 98420


def _resolve_employee_id(employee_id: str = "") -> str:
    if employee_id and employee_id != "me":
        return employee_id
    configured = os.environ.get("SAGE_INTACCT_DEFAULT_EMPLOYEE_ID", "")
    if not configured:
        raise RuntimeError(
            "No employee_id supplied and SAGE_INTACCT_DEFAULT_EMPLOYEE_ID is not set"
        )
    return configured


def _parse_date(value: str) -> datetime.date:
    if not value:
        raise ValueError("Date value is required")
    try:
        return datetime.date.fromisoformat(value)
    except ValueError:
        pass
    parts = value.split("/")
    if len(parts) == 3:
        month, day, year = parts
        try:
            return datetime.date(int(year), int(month), int(day))
        except ValueError:
            pass
    raise ValueError(f"Unrecognised date '{value}'. Use YYYY-MM-DD or MM/DD/YYYY.")


def _to_intacct_date(value: str) -> str:
    return _parse_date(value).strftime("%m/%d/%Y")


def _to_iso_date(value: str) -> str:
    return _parse_date(value).isoformat()


def _tag(name: str, value: Any) -> str:
    if value is None:
        return f"<{name}></{name}>"
    return f"<{name}>{escape(str(value))}</{name}>"


def build_timesheet_xml(
    employee_id: str,
    begin_date: str,
    entries: list[dict[str, Any]],
    description: str = "",
) -> str:
    entry_blocks = []
    for entry in entries:
        fields = "".join(
            [
                _tag("ENTRYDATE", _to_intacct_date(entry["entry_date"])),
                _tag("QTY", entry["qty"]),
                _tag("BILLABLE", str(entry.get("billable", True)).lower()),
                _tag("DEPARTMENTID", entry.get("department_id", "")),
                _tag("LOCATIONID", entry.get("location_id", "")),
                _tag("PROJECTID", entry["project_id"]),
                _tag("TASKKEY", entry["task_key"]),
                _tag("NOTES", entry.get("notes", "")),
            ]
        )
        entry_blocks.append(f"            <TIMESHEETENTRY>{fields}</TIMESHEETENTRY>")
    entries_xml = "\n".join(entry_blocks)
    return f"""<create>
    <TIMESHEET>
        {_tag("EMPLOYEEID", employee_id)}
        {_tag("BEGINDATE", _to_intacct_date(begin_date))}
        <GLPOSTDATE></GLPOSTDATE>
        {_tag("DESCRIPTION", description)}
        <SUPDOCID></SUPDOCID>
        <STATE>Submitted</STATE>
        <TIMESHEETENTRIES>
{entries_xml}
        </TIMESHEETENTRIES>
    </TIMESHEET>
</create>"""


async def intacct_request(payload_xml: str) -> dict[str, Any]:
    raise NotImplementedError(
        "Live Sage Intacct XML Gateway integration is not implemented. "
        "Set INTACCT_MOCK_MODE=true until credentials are provisioned."
    )


async def get_projects_and_tasks(
    customer_id: str = "",
    status: str = "active",
) -> list[dict[str, Any]]:
    if not MOCK_MODE:
        return await intacct_request(
            "<readByQuery><object>PROJECT</object></readByQuery>"
        )
    results = MOCK_PROJECTS
    if customer_id:
        results = [p for p in results if p["customer_id"] == customer_id]
    if status and status != "all":
        results = [p for p in results if p["status"] == status]
    return results


async def submit_timesheet(
    begin_date: str,
    entries: list[dict[str, Any]],
    employee_id: str = "",
    description: str = "",
) -> dict[str, Any]:
    if not entries:
        raise ValueError("At least one timesheet entry is required")
    resolved_employee = _resolve_employee_id(employee_id)
    payload_xml = build_timesheet_xml(
        resolved_employee, begin_date, entries, description
    )
    if not MOCK_MODE:
        return await intacct_request(payload_xml)

    global _mock_sequence
    _mock_sequence += 1
    iso_begin = _to_iso_date(begin_date)
    record_no = f"TS-{iso_begin[:4]}-{_mock_sequence}"
    total_hours = sum(float(e["qty"]) for e in entries)
    stored = {
        "record_no": record_no,
        "employee_id": resolved_employee,
        "begin_date": iso_begin,
        "state": "submitted",
        "description": description,
        "entries": [
            {
                "entry_date": _to_iso_date(e["entry_date"]),
                "project_id": e["project_id"],
                "task_key": e["task_key"],
                "qty": float(e["qty"]),
                "billable": bool(e.get("billable", True)),
                "notes": e.get("notes", ""),
            }
            for e in entries
        ],
    }
    _mock_timesheets[record_no] = stored
    return {
        "status": "success",
        "action": "create_timesheet",
        "record_no": record_no,
        "employee_id": resolved_employee,
        "begin_date": iso_begin,
        "total_hours": total_hours,
        "entries_count": len(entries),
        "submission_state": "submitted",
        "message": (
            f"Timesheet {record_no} successfully created and submitted to Sage Intacct"
        ),
    }


async def get_timesheet(
    start_date: str,
    employee_id: str = "",
    end_date: str = "",
) -> list[dict[str, Any]]:
    resolved_employee = _resolve_employee_id(employee_id)
    if not MOCK_MODE:
        return await intacct_request(
            "<readByQuery><object>TIMESHEET</object></readByQuery>"
        )
    start_iso = _to_iso_date(start_date)
    end_iso = _to_iso_date(end_date) if end_date else None
    matches = []
    for sheet in _mock_timesheets.values():
        if sheet["employee_id"] != resolved_employee:
            continue
        if sheet["begin_date"] < start_iso:
            continue
        if end_iso and sheet["begin_date"] > end_iso:
            continue
        matches.append(sheet)
    return matches


TOOL_HANDLERS = {
    "intacct_get_projects_and_tasks": get_projects_and_tasks,
    "intacct_submit_timesheet": submit_timesheet,
    "intacct_get_timesheet": get_timesheet,
}

TIMESHEET_ENTRY_SCHEMA = {
    "type": "object",
    "properties": {
        "entry_date": {
            "type": "string",
            "description": "Date the hours were worked, as YYYY-MM-DD.",
        },
        "project_id": {
            "type": "string",
            "description": "Project or docket identifier, e.g. 'P002-EPSON'.",
        },
        "task_key": {
            "type": "string",
            "description": "Task key from intacct_get_projects_and_tasks, e.g. '1001'.",
        },
        "qty": {"type": "number", "description": "Hours worked, e.g. 4.5."},
        "billable": {
            "type": "boolean",
            "description": "Whether the entry is billable. Defaults to true.",
        },
        "notes": {
            "type": "string",
            "description": "Description of the work done. Optional.",
        },
        "department_id": {
            "type": "string",
            "description": "Department tracking code. Optional.",
        },
        "location_id": {
            "type": "string",
            "description": "Location tracking code. Optional.",
        },
    },
    "required": ["entry_date", "project_id", "task_key", "qty"],
}

TOOL_SCHEMAS = [
    mcp_types.Tool(
        name="intacct_get_projects_and_tasks",
        description=(
            "List Sage Intacct projects (dockets) and their tasks that are "
            "available for time entry. Use the returned project_id and "
            "task_key when building timesheet entries."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "customer_id": {
                    "type": "string",
                    "description": "Filter to one client or customer ID. Optional.",
                },
                "status": {
                    "type": "string",
                    "description": (
                        "Project status filter: 'active', 'completed', or "
                        "'all'. Defaults to 'active'."
                    ),
                },
            },
        },
    ),
    mcp_types.Tool(
        name="intacct_submit_timesheet",
        description=(
            "Create and submit a Sage Intacct timesheet for a period. Present "
            "the entries to the user and get explicit approval before calling "
            "this, because it writes to Sage Intacct."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "begin_date": {
                    "type": "string",
                    "description": "First day of the timesheet period, as YYYY-MM-DD.",
                },
                "entries": {
                    "type": "array",
                    "description": "Timesheet entry lines.",
                    "items": TIMESHEET_ENTRY_SCHEMA,
                },
                "employee_id": {
                    "type": "string",
                    "description": (
                        "Sage Intacct employee ID. Omit to use the employee "
                        "configured for this server."
                    ),
                },
                "description": {
                    "type": "string",
                    "description": "Overall timesheet notes. Optional.",
                },
            },
            "required": ["begin_date", "entries"],
        },
    ),
    mcp_types.Tool(
        name="intacct_get_timesheet",
        description=("Read Sage Intacct timesheets for an employee over a date range."),
        inputSchema={
            "type": "object",
            "properties": {
                "start_date": {
                    "type": "string",
                    "description": "Beginning of the query range, as YYYY-MM-DD.",
                },
                "end_date": {
                    "type": "string",
                    "description": "End of the query range, as YYYY-MM-DD. Optional.",
                },
                "employee_id": {
                    "type": "string",
                    "description": (
                        "Sage Intacct employee ID. Omit to use the employee "
                        "configured for this server."
                    ),
                },
            },
            "required": ["start_date"],
        },
    ),
]

app = Server("sage-intacct-mcp-server")
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
    except (
        ValueError,
        KeyError,
        TypeError,
        RuntimeError,
        NotImplementedError,
        httpx.HTTPError,
    ) as e:
        error_text = json.dumps({"error": f"Failed to execute tool '{name}': {e}"})
        return [mcp_types.TextContent(type="text", text=error_text)]


async def handle_sse(request):
    async with sse.connect_sse(
        request.scope, request.receive, request._send
    ) as streams:
        await app.run(streams[0], streams[1], app.create_initialization_options())


starlette_app = Starlette(
    routes=[
        Route("/sse", endpoint=handle_sse),
        Mount("/messages/", app=sse.handle_post_message),
    ],
)

if __name__ == "__main__":
    host = os.environ.get("APP_HOST", "0.0.0.0")
    port = int(os.environ.get("APP_PORT", "8080"))
    mode = "mock" if MOCK_MODE else "live"
    print(f"Launching Sage Intacct MCP Server on {host}:{port} (sse, {mode})...")
    try:
        uvicorn.run(starlette_app, host=host, port=port)
    except KeyboardInterrupt:
        print("\nMCP Server stopped by user.")
    finally:
        print("MCP Server process exiting.")
