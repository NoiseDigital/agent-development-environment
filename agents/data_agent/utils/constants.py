### AGENT CONSTANTS ###

def get_agent_name():
    return "data_agent"


def get_agent_description():
    return """
    A CRM Data Analytics Consultant agent deployed to Vertex AI Agent Engine.
    """


def get_root_agent_model():
    return "gemini-2.0-flash"


### DEPLOYMENT CONSTANTS ###

def get_agent_display_name():
    return "Data Agent"

def get_agent_display_description():
    return """
    A CRM Data Analytics Consultant agent deployed to Vertex AI Agent Engine.
    """

# To be populated after first deployment
def get_resource_engine_id():
    return None
