### AGENT CONSTANTS ###

def get_agent_name():
    return "math_agent"


def get_agent_description():
    return """
    A simple agent that helps does Math with MCP servers.
    """


def get_root_agent_model():
    return "gemini-2.0-flash"


### DEPLOYMENT CONSTANTS ###

def get_agent_display_name():
    return "Math Agent"

def get_agent_display_description():
    return """
    A simple agent that helps does Math with MCP servers.
    """

# To be populated after first deployment
def get_resource_engine_id():
    return ""
