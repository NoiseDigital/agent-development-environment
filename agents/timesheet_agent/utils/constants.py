### AGENT CONSTANTS ###

def get_agent_name():
    return "timesheet_agent"


def get_agent_description():
    return """
    A simple agent that helps users build and submit timesheets.
    """


def get_root_agent_model():
    return "gemini-2.0-flash"


### DEPLOYMENT CONSTANTS ###

def get_agent_display_name():
    return "Timesheet Agent"

def get_agent_display_description():
    return """
    A simple agent that helps users build and submit timesheets.
    """

# To be populated after first deployment
def get_resource_engine_id():
    return "4265304671305859072"
