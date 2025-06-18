def get_asana_tasks(
    user_id: str = "me",
    project_id: str = "",
    completed_since: str = "now",
):
    """Mock function to retrieve Asana tasks associated with a user, with docket/project IDs in the task name.

    Args:
        user_id: The Asana user ID or 'me' for the current user. Defaults to 'me'.
        project_id: Optional Asana project ID to filter tasks. Defaults to empty string (all projects).
        completed_since: Only return tasks not completed since this time. Defaults to 'now'.

    Returns:
        dict: A dictionary containing mock Asana task data.
    """
    tasks = [
        {
            "id": "1234567890",
            "name": "Prepare project report [P002-EPSON]",
            "completed": False,
            "assignee": user_id,
            "project_id": project_id or "P002-EPSON",
            "due_on": "2025-06-20",
        },
        {
            "id": "0987654321",
            "name": "Review pull requests [P003-ACME]",
            "completed": True,
            "assignee": user_id,
            "project_id": project_id or "P003-ACME",
            "due_on": "2025-06-15",
        },
        {
            "id": "1122334455",
            "name": "Finalize budget [P004-XYZ]",
            "completed": False,
            "assignee": user_id,
            "project_id": project_id or "P004-XYZ",
            "due_on": "2025-06-22",
        },
    ]
    return {
        "data": tasks,
        "completed_since": completed_since,
        "user_id": user_id,
        "project_id": project_id,
    }
