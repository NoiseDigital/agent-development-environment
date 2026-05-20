"""Agent platform backend — the ADK FastAPI app plus the platform's own API."""

import os
from pathlib import Path

import uvicorn
from google.adk.cli.fast_api import get_fast_api_app

from api.sources.routes import router as sources_router
from api.feedback.routes import router as feedback_router
from api.sessions.routes import router as sessions_router
from api.naming import router as naming_router

AGENTS_DIR = str(Path(__file__).resolve().parent / "adk_agents")

app = get_fast_api_app(
    agents_dir=AGENTS_DIR,
    session_service_uri=os.environ.get("DATABASE_URL"),
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "http://localhost").split(","),
    web=True,
    trace_to_cloud=False,
)

# Platform API — everything ADK's FastAPI app doesn't already provide.
app.include_router(sources_router)  # uploads + BigQuery catalog
app.include_router(feedback_router)  # per-message thumb ratings
app.include_router(sessions_router)  # session display names
app.include_router(naming_router)  # session-name generation


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
