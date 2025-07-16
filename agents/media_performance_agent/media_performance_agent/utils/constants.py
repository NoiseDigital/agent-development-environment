### AGENT CONSTANTS ###

def get_agent_name():
    return "media_performance_agent"


def get_agent_description():
    return """
    A simple agent that helps analyze media performance data in BigQuery.
    """


def get_root_agent_model():
    return "gemini-2.0-flash"


### DEPLOYMENT CONSTANTS ###

def get_agent_display_name():
    return "Media Performance Agent"

def get_agent_display_description():
    return """
    A simple agent that helps analyze media performance data in BigQuery.
    """

# To be populated after first deployment
def get_resource_engine_id():
    return ""
