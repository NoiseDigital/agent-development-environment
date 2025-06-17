# Copyright 2025 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# You may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""
Deploy the data_agent to Vertex AI Agent Engine.
"""

from pathlib import Path
import sys
from vertexai import agent_engines
import vertexai
import os

sys.path.append(str(Path(__file__).resolve().parent.parent.parent.parent))
from src.agents.data_agent.agent import root_agent
from src.agents.data_agent.utils.constants import (
    get_resource_engine_id,
    get_agent_name,
    get_agent_display_name,
    get_agent_display_description
)

# Load environment variables
PROJECT_ID = os.environ["GOOGLE_CLOUD_PROJECT"]
LOCATION = os.environ["GOOGLE_CLOUD_LOCATION"]
RESOURCE_ENGINE_ID = get_resource_engine_id()
STAGING_BUCKET = f"gs://{os.environ['AI_STORAGE_BUCKET']}"

# Define requirements (pin versions as needed)
requirements = [
    "google-cloud-aiplatform[agent_engines,adk]==1.97.0",
    "google-genai==1.19.*"
]

# Include the entire agents directory
extra_packages = [
    "src/agents/data_agent",
]

# Optionally, set environment variables required by your agent
# env_vars = {"MY_ENV_VAR": "my_value"}
env_vars = None

# Optionally, set a GCS directory for staging (None uses default)
gcs_dir_name = f"uat/{get_agent_name()}"

# Optionally, set display name and description
display_name = get_agent_display_name()
description = get_agent_display_description()


def main():
    action = input(
        "Type 'deploy' to deploy a new agent or 'update' to update an existing agent: ").strip().lower()
    if action not in ("deploy", "update"):
        print("Invalid action. Exiting.")
        sys.exit(1)

    vertexai.init(
        project=PROJECT_ID,
        location=LOCATION,
        staging_bucket=STAGING_BUCKET,
    )

    if action == "deploy":
        print("Deploying agent to Vertex AI Agent Engine...")
        remote_agent = agent_engines.create(
            agent_engine=root_agent,
            requirements=requirements,
            display_name=display_name,
            description=description,
            gcs_dir_name=gcs_dir_name,
            extra_packages=extra_packages,
            env_vars=env_vars,
        )
        print("Deployment complete.")
        print(f"Agent resource name: {remote_agent.resource_name}")
    if action == "update":
        resource_name = RESOURCE_ENGINE_ID
        if not resource_name:
            print(
                "RESOURCE_ENGINE_ID variable is not set. Cannot update agent.")
            print(
                "If this is your first deployment, you must deploy first to create a new agent.")
            print("Run this script again and choose 'deploy' to deploy a new agent. After deployment, save the printed resource name as RESOURCE_ENGINE_ID for future updates.")
            sys.exit(1)
        print(f"Updating agent {resource_name} on Vertex AI Agent Engine...")
        agent_engines.update(
            resource_name=resource_name,
            agent_engine=root_agent,
            requirements=requirements,
            display_name=display_name,
            description=description,
            gcs_dir_name=gcs_dir_name,
            extra_packages=extra_packages,
            env_vars=env_vars,
        )
        print("Update complete.")
    else:
        print("No action taken. Exiting.")


if __name__ == "__main__":
    main()
