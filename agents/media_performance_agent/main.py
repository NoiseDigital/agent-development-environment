import os
import logging

import uvicorn
from google.adk.cli.fast_api import get_fast_api_app
from google.adk.artifacts import GcsArtifactService

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get the directory where main.py is located
AGENT_DIR = os.path.dirname(os.path.abspath(__file__))

gcs_bucket_name_py = "gs://nd-agent-engine-artifacts-sbx"

SESSION_DB_URL = "postgresql+pg8000://postgres:password@35.239.165.179/postgres"
# Example allowed origins for CORS
ALLOWED_ORIGINS = ["http://localhost", "http://localhost:8080", "*"]
# Set web=True if you intend to serve a web interface, False otherwise
SERVE_WEB_INTERFACE = True
TRACE_TO_CLOUD = True

# Call the function to get the FastAPI app instance
app = get_fast_api_app(
    agents_dir=AGENT_DIR,
    session_service_uri=SESSION_DB_URL,
    artifact_service_uri=gcs_bucket_name_py,
    allow_origins=ALLOWED_ORIGINS,
    web=SERVE_WEB_INTERFACE,
    trace_to_cloud=TRACE_TO_CLOUD,
)

if __name__ == "__main__":
    # Use the PORT environment variable provided by Cloud Run, defaulting to 8080
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))