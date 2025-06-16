#!/usr/bin/env python
# Copyright 2025 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from pathlib import Path
import os
import subprocess
import sys

sys.path.append(str(Path(__file__).parent.parent))
from src.shared.config_env import prepare_environment

prepare_environment()

cmd_line = f"""
gcloud run deploy "{sys.argv[1]}"
        --project="{os.environ['GOOGLE_CLOUD_PROJECT']}"
        --region="{os.environ['GOOGLE_CLOUD_LOCATION']}"
        --port=8080
        --cpu=8
        --memory=32Gi
        --cpu-boost
        --no-allow-unauthenticated
        --no-cpu-throttling
        --source "./src"
        --timeout 1h
        -q
""".replace("\n", " ").strip()

subprocess.run(cmd_line, shell=True)
