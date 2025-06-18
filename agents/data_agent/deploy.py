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
import os

sys.path.append(str(Path(__file__).resolve().parent.parent.parent))
from agents.data_agent.agent import root_agent
from agents.data_agent.utils.constants import (
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
    "google-genai==1.19.*"
]

# Include the entire agents directory
extra_packages = [
    "agents/data_agent",
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
