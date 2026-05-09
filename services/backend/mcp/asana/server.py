"""
Mock MCP server for Asana tools.
"""

from fastapi import FastAPI
from typing import Dict, Any

app = FastAPI()


@app.post("/get_tasks")
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


@app.get("/health")
def health_check():
    return {"status": "ok"}
