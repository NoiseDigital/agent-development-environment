"""
Deploy the data_agent to Vertex AI Agent Engine.
"""

import os
import vertexai
from vertexai import agent_engines
import sys
from pathlib import Path
# Add the parent of 'agents' (which is 'src') to sys.path
sys.path.append(str(Path(__file__).resolve().parent.parent.parent.parent))
from src.agents.hello_world_agent.agent import root_agent

# Load environment variables
PROJECT_ID = os.environ["GOOGLE_CLOUD_PROJECT"]
LOCATION = os.environ["GOOGLE_CLOUD_LOCATION"].replace('"', '')
STAGING_BUCKET = f"gs://{os.environ['AI_STORAGE_BUCKET']}"

vertexai.init(
    project=PROJECT_ID,
    location=LOCATION,
    staging_bucket=STAGING_BUCKET,
)

# Define requirements (pin versions as needed)
requirements = [
    "google-cloud-aiplatform[agent_engines,adk]==1.97.0",
    # Add any other dependencies here
]

# Include the entire agents directory
extra_packages = ["src/agents/hello_world_agent/tools",
                  "src/agents/hello_world_agent/prompts",
                  "src/agents/hello_world_agent",
                  "src/agents",
                  ]

# Optionally, set environment variables required by your agent
# env_vars = {"MY_ENV_VAR": "my_value"}
env_vars = None

# Optionally, set a GCS directory for staging (None uses default)
gcs_dir_name = None

# Optionally, set display name and description
display_name = "Hello World Agent"
description = """
A simple agent that responds to greetings.
"""

if __name__ == "__main__":
    print("Deploying agent to Vertex AI Agent Engine...")
    remote_agent = agent_engines.create(
        root_agent,
        requirements=requirements,
        extra_packages=extra_packages,
        gcs_dir_name=gcs_dir_name,
        display_name=display_name,
        description=description,
        env_vars=env_vars,
    )
    print("Deployment complete.")
    print(f"Agent resource name: {remote_agent.resource_name}")
    # projects/531286059015/locations/us-central1/reasoningEngines/4297111343674163200
