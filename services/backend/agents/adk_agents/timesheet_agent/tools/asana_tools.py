import httpx
import os

ASANA_MCP_URL = os.getenv("ASANA_MCP_URL", "http://mcp-asana:8080")


def get_asana_tasks(
    project_id: str = "",
    completed_since: str = "now",
):
    """Retrieves Asana tasks by calling the mcp-asana service.

    Args:
        project_id: Optional Asana project ID to filter tasks. Defaults to empty string (all projects).
        completed_since: Only return tasks not completed since this time. Defaults to 'now'.

    Returns:
        dict: A dictionary containing Asana task data from the MCP service.
    """
    try:
        with httpx.Client() as client:
            response = client.post(
                f"{ASANA_MCP_URL}/get_tasks",
                params={"project_id": project_id, "completed_since": completed_since},
                timeout=10.0,
            )
            response.raise_for_status()
            return response.json()
    except httpx.RequestError as e:
        print(f"An error occurred while requesting tasks from mcp-asana: {e}")
        return {"error": str(e)}
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return {"error": "An unexpected error occurred"}
