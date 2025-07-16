import logging
from collections.abc import AsyncIterable

from google.adk import Runner
from google.adk.agents import LlmAgent
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset
from google.adk.tools.mcp_tool.mcp_session_manager import SseConnectionParams
from google.adk.artifacts import InMemoryArtifactService
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.sessions import InMemorySessionService
from google.genai import types

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- ADK Web Global Agent Instance ---
# This part is specifically for enabling ADK Web usage
# It expects a top-level LlmAgent instance named 'root_agent'.
# Local URL (after running cd tools/mcp-on-cloudrun python server.py)
# MCP_SERVER_URL = "http://0.0.0.0:8080/sse"

# Remote URL (deployed Cloud Run MCP Server)
MCP_SERVER_URL = "https://mcp-math-192748761045.us-central1.run.app/sse"

# Define a function to build the LlmAgent instance.
def _build_llm_agent() -> LlmAgent:
    # NOTE: Must set errlog=None to deploy to Agent Engine
    tools = MCPToolset(
        connection_params=SseConnectionParams(
            url=MCP_SERVER_URL
        ),
        errlog=None
    )

    return LlmAgent(
        model='gemini-2.0-flash',
        name='math_agent',
        instruction="""
            You do math with tools
        """,
        tools=[tools],
    )



# Instantiate the LlmAgent at the global level for ADK Web deployments
root_agent = _build_llm_agent()

# --- MathAgent Class (for A2A server) ---
# This class wraps the root_agent and provides the 'invoke' method
# expected by AgentTaskManager.
class MathAgent:
    """
    Agent to answer questions about Math using Gemini and MCP tools.
    This class is primarily used by the A2A server via AgentTaskManager.
    """
    SUPPORTED_CONTENT_TYPES = ["text", "text/plain"]

    def __init__(self):
        # Use the globally defined root_agent instance
        self._agent = root_agent
        self._user_id = "media_performance_agent_user"
        self._runner = Runner(
            app_name=self._agent.name,
            agent=self._agent, # Pass the LlmAgent instance to the Runner
            artifact_service=InMemoryArtifactService(),
            session_service=InMemorySessionService(),
            memory_service=InMemoryMemoryService(),
        )
        logger.info("MathAgent (wrapper) initialized.")


    async def invoke(self, query: str, session_id: str) -> AsyncIterable[dict]:
        logger.info(f"Received query for session {session_id}: {query[:100]}...")
        session = await self._runner.session_service.get_session(
            app_name=self._agent.name,
            user_id=self._user_id,
            session_id=session_id,
        )
        if session is None:
            session = await self._runner.session_service.create_session(
                app_name=self._agent.name,
                user_id=self._user_id,
                session_id=session_id,
                state={},
            )
            logger.info(f"Created new session {session_id}.")

        user_content = types.Content(
            role="user",
            parts=[types.Part.from_text(text=query)]
        )

        async for event in self._runner.run_async(
            user_id=self._user_id,
            session_id=session.id,
            new_message=user_content
        ):
            if event.is_final_response():
                response_text = ""
                if event.content and event.content.parts and event.content.parts[-1].text:
                    response_text = event.content.parts[-1].text
                logger.info(f"Final response for session {session_id}.")
                yield {
                    'is_task_complete': True,
                    'content': response_text,
                }
            else:
                yield {
                    'is_task_complete': False,
                    'updates': "Processing the media performance request...",
                }