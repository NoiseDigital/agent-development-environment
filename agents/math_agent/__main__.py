import uvicorn
import click
import logging
from dotenv import load_dotenv
load_dotenv()

from a2a.server.apps import A2AStarletteApplication
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import (
    AgentCapabilities,
    AgentCard,
    AgentSkill,
)

# Import your agent-specific logic
from task_manager import AgentTaskManager

# -----------------------------------------------------------------------------
# Logging Setup
# Configure logging to display information and errors in the console.
# -----------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# Main Entry Function - Configurable via Command-Line Interface (CLI)
# This function sets up and starts the agent server.
# -----------------------------------------------------------------------------
@click.command()
@click.option("--host", default="0.0.0.0", help="The host address to bind the server to. Default is '0.0.0.0'.")
@click.option("--port", default=8080, type=int, help="The port number for the server to listen on. Default is 8080.")
def main(host: str, port: int):
    """
    This function initializes and starts the A2A (Agent-to-Agent) server for the
    MathAgent. It's designed to be run from the command line.
    """
    logger.info(f"Starting MathAgent Server on http://{host}:{port}")

    # Define the skill that this agent provides.
    skill = AgentSkill(
        id="MathAgent",
        name="Math Agent",
        description="Agent to answer questions about Math.",
        tags=["math", "arithmetic", "geometry", "algebra"],
        examples=[
            "Add 2+2",
            "Subtract 10-3"
        ]
    )

    # Create an Agent Card, which serves as a public identity and metadata
    agent_card = AgentCard(
        name="MathAgent",
        description="Agent to answer questions about Math.",
        url="https://agent-math-192748761045.us-central1.run.app/", # Change to localhost when running locally
        version="1.0.0",
        defaultInputModes=['text'],
        defaultOutputModes=['text'],
        capabilities=AgentCapabilities(streaming=True),
        skills=[skill],
        supportsAuthenticatedExtendedCard=True,
    )

    # Initialize the request handler for the agent server.
    request_handler = DefaultRequestHandler(
        agent_executor=AgentTaskManager(),
        task_store=InMemoryTaskStore(),
    )

    # Create the A2A Starlette application.
    server = A2AStarletteApplication(
        agent_card=agent_card,
        http_handler=request_handler
    )

    # Start the server using Uvicorn.
    logger.info("Uvicorn server starting...")
    uvicorn.run(server.build(), host=host, port=port)

# -----------------------------------------------------------------------------
# Script Entry Point
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    main()