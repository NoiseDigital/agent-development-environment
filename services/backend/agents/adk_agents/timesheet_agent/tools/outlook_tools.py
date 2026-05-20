def get_outlook_calendar_events(
    start_date: str = "",
    end_date: str = "",
):
    """Mock function to retrieve Outlook calendar events for a user, with docket IDs in the meeting title.

    Args:
        start_date: The start date (YYYY-MM-DD) to filter events. Defaults to None (no filter).
        end_date: The end date (YYYY-MM-DD) to filter events. Defaults to None (no filter).

    Returns:
        dict: A dictionary containing mock Outlook calendar event data.
    """
    # Docket/project IDs are embedded in the subject/title, as if pulled from Outlook
    events = [
        {
            "id": "evt-001",
            "subject": "Project Standup Meeting [P002-EPSON]",
            "start": "2025-06-18T09:00:00",
            "end": "2025-06-18T09:30:00",
            "location": "Conference Room A",
            "organizer": "MockUser123",
            "attendees": ["MockUser123", "alice@example.com"],
        },
        {
            "id": "evt-002",
            "subject": "ACME Client Call [P003-ACME]",
            "start": "2025-06-18T11:00:00",
            "end": "2025-06-18T12:00:00",
            "location": "Zoom",
            "organizer": "MockUser123",
            "attendees": ["MockUser123", "bob@example.com"],
        },
        {
            "id": "evt-003",
            "subject": "XYZ Project Review [P004-XYZ]",
            "start": "2025-06-19T14:00:00",
            "end": "2025-06-19T15:00:00",
            "location": "Teams",
            "organizer": "MockUser123",
            "attendees": ["MockUser123", "carol@example.com"],
        },
    ]
    return {
        "data": events,
        "user_id": "MockUser123",
        "start_date": start_date,
        "end_date": end_date,
    }
