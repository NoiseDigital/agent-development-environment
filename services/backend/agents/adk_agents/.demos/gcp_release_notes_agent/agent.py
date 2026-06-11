from google.adk.agents import Agent

from shared.toolbox import get_toolbox_client

# NOTE: This agent cannot be deployed to Agent Engine — ToolboxSyncClient cannot be pickled.
toolbox = get_toolbox_client()
tools = toolbox.load_toolset("public_bq_toolset")

root_agent = Agent(
    name="gcp_releasenotes_agent",
    model="gemini-2.5-flash",
    description="Summarize GCP Release Notes",
    instruction="You are a helpful agent who can answer user questions about GCP Release Notes. Use the tools to answer the question. Give your answers in a mix of text insights and markdown formatted tables.",
    tools=tools,
)
