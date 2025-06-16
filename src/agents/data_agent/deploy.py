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

import os
import vertexai
from vertexai import agent_engines
from agent import root_agent

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
extra_packages = ["../../agents"]

# Optionally, set environment variables required by your agent
# env_vars = {"MY_ENV_VAR": "my_value"}
env_vars = None

# Optionally, set a GCS directory for staging (None uses default)
gcs_dir_name = None

# Optionally, set display name and description
display_name = "Data Agent"
description = """
A CRM Data Analytics Consultant agent deployed to Vertex AI Agent Engine.
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
