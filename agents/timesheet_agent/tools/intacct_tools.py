from typing import List

def get_user_docket_ids() -> List[str]:
    """Mock function to fetch Docket IDs the user can submit hours to.

    Args:
        user_id: The employee/user ID. Defaults to 'me'.

    Returns:
        List[str]: A list of Docket IDs accessible to the user.
    """
    # This is a mock response. Replace with real API call as needed.
    return ["P002-EPSON", "P003-ACME", "P004-XYZ"]


def build_timesheet_xml(
    begin_date: str,
    entries: list,
    description: str = "",
) -> str:
    """Builds an XML timesheet for submission to Intacct.

    Args:
        begin_date: The start date of the timesheet (MM/DD/YYYY).
        entries: A list of dicts, each representing a timesheet entry.
        description: Optional description for the timesheet.

    Returns:
        str: XML string representing the timesheet.
    """
    entries_xml = "\n".join([
        f"    <TIMESHEETENTRY>"
        f"<ENTRYDATE>{e.get('entry_date')}</ENTRYDATE>"
        f"<QTY>{e.get('qty')}</QTY>"
        f"<BILLABLE>{str(e.get('billable', False)).lower()}</BILLABLE>"
        f"<DEPARTMENTID>{e.get('department_id')}</DEPARTMENTID>"
        f"<LOCATIONID>{e.get('location_id')}</LOCATIONID>"
        f"<PROJECTID>{e.get('project_id')}</PROJECTID>"
        f"<TASKKEY>{e.get('task_key')}</TASKKEY>"
        f"<NOTES>{e.get('notes', '')}</NOTES>"
        f"</TIMESHEETENTRY>"
        for e in entries
    ])
    xml = f"""
<create>
    <TIMESHEET>
        <EMPLOYEEID>MockUser123</EMPLOYEEID>
        <BEGINDATE>{begin_date}</BEGINDATE>
        <GLPOSTDATE></GLPOSTDATE>
        <DESCRIPTION>{description}</DESCRIPTION>
        <SUPDOCID></SUPDOCID>
        <STATE></STATE>
        <TIMESHEETENTRIES>
{entries_xml}
        </TIMESHEETENTRIES>
    </TIMESHEET>
</create>"""
    return xml.strip()


def submit_timesheet_xml(xml_string: str) -> str:
    """Mock function to submit the XML timesheet to Intacct.

    Args:
        xml_string: The XML string representing the timesheet.

    Returns:
        str: Submission status message.
    """
    # In a real implementation, this would POST to Intacct's API.
    print("Submitting timesheet to Intacct...")
    print(xml_string)
    return "submitted"
