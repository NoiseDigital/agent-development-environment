import os
from a2a.client import A2AClient, A2ACardResolver
import logging
from uuid import uuid4
from google.adk.tools.function_tool import FunctionTool
from google.adk.agents.llm_agent import LlmAgent
import httpx
from dotenv import load_dotenv
from a2a.types import (
    AgentCard
)

from a2a.types import (
    AgentCard,
    SendMessageRequest,
)

load_dotenv()
logger = logging.getLogger(__name__)

model_name = os.getenv("GOOGLE_MODEL_NAME", "gemini-2.0-flash")

# Retrieve the A2A agent registry base URL from environment variables with a default fallback.
AGENT_REGISTRY_BASE_URL = "https://agent-media-performance-192748761045.us-central1.run.app"


async def list_agents() -> list[dict]:
    """
    Fetch all AgentCard metadata from the registry,
    return as a list of plain dicts.
    """
    async with httpx.AsyncClient() as httpx_client:
        base_url = AGENT_REGISTRY_BASE_URL.rstrip("/")
        # response = await client.get(url, timeout=50.0)

        logger.info("Initializing A2ACardResolver to fetch agent capabilities.")
        resolver = A2ACardResolver(
            httpx_client=httpx_client,
            base_url=base_url,
            # agent_card_path and extended_agent_card_path use defaults if not specified
        )
        final_agent_card_to_use: AgentCard | None = None

        try:
            logger.info(
                f"Attempting to fetch public agent card from: {base_url}"
            )
            # Fetches the AgentCard from the standard public path.
            public_card = await resolver.get_agent_card()
            logger.info("Successfully fetched public agent card:")
            logger.info(
                public_card.model_dump_json(indent=2, exclude_none=True)
            )
            final_agent_card_to_use = public_card
            logger.info(
                "Using PUBLIC agent card for A2AClient initialization.")

        except Exception as e:
            logger.error(
                f"Critical error fetching public agent card from {base_url}: {e}",
                exc_info=True  # This prints the full traceback, very helpful for debugging
            )
            raise RuntimeError(
                "Failed to fetch the public agent card. Cannot continue."
            ) from e

        cards_data = final_agent_card_to_use
        # Assuming AgentCard has a 'name' attribute, print the name instead of length
        print(f"Fetched agent '{cards_data.name}' from registry at {base_url}")
        print(f"Agent data: {cards_data}")
        return cards_data


async def call_agent(agent_name: str, message: str) -> str:
    """
    Given an agent_name string and a user message,
    find that agent's URL, send the task, and return its reply.
    """
    cards = await list_agents()  # Use the module-level list_agents

    client = A2AClient(httpx_client=httpx.AsyncClient(timeout=3000),
                       agent_card=cards)

    print("Connected to A2AClient at", AGENT_REGISTRY_BASE_URL)
    session_id = "transalation_session"
    # Find the agent card by name
    task_id = uuid4().hex

    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "message/send",
        "params": {
            "message": {
                "role": "user",
                "parts": [
                    {
                        "kind": "text",
                        "text": message
                    }
                ],
                "messageId": uuid4().hex
            },
            "metadata": {}
        }
    }

    # Using user_id as session_id for simplicity as in original code

    response_rec = await client.send_message(SendMessageRequest(**payload))
    # print("Response from send_message:", reasponse_rec.model_dump(
    #     mode='json', exclude_none=True))

    print("Response from send_message:", response_rec)

    response = response_rec.model_dump(mode='json', exclude_none=True)
    # print("Formatted Response:", response)
    # print("parse", response['result']['status']['message']['parts'][0]['text'])
    return (response['result']['status']['message']['parts'][0]['text'])

# System instruction for the LLM
system_instr = (
    "You are a root orchestrator agent. You have two tools:\n"
    "1) list_agents() → Use this tool to see a list of all available agents and their capabilities.\n"
    "2) call_agent(agent_name: str, message: str) → Use this tool to send a message to a specific agent by its name and get its response.\n"
    "Use these tools to fulfill user requests by discovering and interacting with other agents as needed.\n"
)

# Create the LlmAgent instance directly
root_agent = LlmAgent(
    model=model_name,
    name="root_orchestrator",
    description="Discovers and orchestrates other agents",
    instruction=system_instr,
    tools=[
        FunctionTool(list_agents),
        FunctionTool(call_agent),
    ],
)

