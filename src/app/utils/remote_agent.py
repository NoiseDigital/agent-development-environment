import os
from vertexai import agent_engines

GOOGLE_CLOUD_PROJECT = os.environ["GOOGLE_CLOUD_PROJECT"]
GOOGLE_CLOUD_LOCATION = os.environ["GOOGLE_CLOUD_LOCATION"]

def get_reasoning_engine_resource_path(reasoning_engine_id: str) -> str:
    return f"projects/{GOOGLE_CLOUD_PROJECT}/locations/{GOOGLE_CLOUD_LOCATION}/reasoningEngines/{reasoning_engine_id}"

def get_remote_agent(reasoning_engine_id: str):
    resource_path = get_reasoning_engine_resource_path(reasoning_engine_id)
    return agent_engines.get(resource_path)