"""
Deploy or Update the Agent on Vertex AI Agent Engine.
"""

from pathlib import Path
import sys
import os

sys.path.append(str(Path(__file__).resolve().parent.parent.parent))
from agents.timesheet_agent.agent import root_agent
from agents.timesheet_agent.utils.constants import (
    get_resource_engine_id,
    get_agent_name,
    get_agent_display_name,
    get_agent_display_description
)
from src.shared.vertex_agent_deploy import deploy_or_update_agent


# Load environment variables
PROJECT_ID = os.environ["GOOGLE_CLOUD_PROJECT"]
LOCATION = os.environ["GOOGLE_CLOUD_LOCATION"]
RESOURCE_ENGINE_ID = get_resource_engine_id()
STAGING_BUCKET = f"gs://{os.environ['AI_STORAGE_BUCKET']}"

# Define requirements (pin versions as needed)
requirements = [
    "google-cloud-aiplatform[agent_engines,adk]==1.97.0",
]

# Optionally include additional directories
extra_packages = [
    "agents/timesheet_agent",
]

# Optionally, set environment variables required by your agent
# env_vars = {"MY_ENV_VAR": "my_value"}
env_vars = None

# Optionally, set a GCS directory for staging (None uses default)
gcs_dir_name = f"uat/{get_agent_name()}"

# Optionally, set display name and description
display_name = get_agent_display_name()
description = get_agent_display_description()

deploy_or_update_agent(
    root_agent=root_agent,
    requirements=requirements,
    display_name=display_name,
    description=description,
    gcs_dir_name=gcs_dir_name,
    extra_packages=extra_packages,
    env_vars=env_vars,
    resource_engine_id=RESOURCE_ENGINE_ID,
    project_id=PROJECT_ID,
    location=LOCATION,
    staging_bucket=STAGING_BUCKET,
)
