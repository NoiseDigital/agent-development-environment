### AGENT CONSTANTS ###

def get_agent_name():
    return "bidi_agent"


def get_agent_description():
    return """
    A simple Bidi agent that can do google searches.
    """


def get_root_agent_model():
    return "gemini-2.0-flash"


### DEPLOYMENT CONSTANTS ###

def get_agent_display_name():
    return "Bidi Agent"

def get_agent_display_description():
    return """
    A simple Bidi agent that can do google searches.
    """

# To be populated after first deployment
def get_resource_engine_id():
    return ""
