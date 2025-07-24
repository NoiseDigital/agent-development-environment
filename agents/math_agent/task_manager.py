
# =============================================================================
# agents/math_agent/task_manager.py
# =============================================================================
# 🎯 Purpose:
# This file defines the AgentTaskManager, which acts as the bridge between
# the A2A (Agent-to-Agent) server framework and our specific MathAgent.
# It manages the execution of agent tasks, handles input/output, and updates
# the task status within the A2A system.
# =============================================================================

# -----------------------------------------------------------------------------
# 📦 Essential Imports
# -----------------------------------------------------------------------------
import logging
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.server.tasks import TaskUpdater
from a2a.types import (
    Task,
    TaskState,
    UnsupportedOperationError,
)
from a2a.utils import (
    new_agent_text_message,
    new_task,
)
from a2a.utils.errors import ServerError

# 🤖 Import the actual agent implementation we want to use
from agent import MathAgent

# -----------------------------------------------------------------------------
# 🪵 Logging Setup
# -----------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# 🛠️ AgentTaskManager: Manages the execution of the MathAgent
# -----------------------------------------------------------------------------
class AgentTaskManager(AgentExecutor):
    """
    Implements the AgentExecutor interface to integrate the MathAgent
    agent into the A2A server framework. This class is responsible for:
    - Initializing the MathAgent agent.
    - Handling incoming user requests and mapping them to agent invocations.
    - Managing task state updates (e.g., 'working', 'completed').
    - Formatting agent responses into A2A Messages.
    """

    def __init__(self):
        self.agent = MathAgent()
        logger.info("AgentTaskManager initialized with MathAgent.")

    async def execute(
        self,
        context: RequestContext,
        event_queue: EventQueue,
    ) -> None:
        query = context.get_user_input()
        logger.info(f"Executing task for query: {query[:100]}...")

        task = context.current_task
        if not task:
            task = new_task(context.message)
            await event_queue.enqueue_event(task)
            logger.info(f"Created new task with ID: {task.id}")
        else:
            logger.info(f"Continuing existing task with ID: {task.id}")

        updater = TaskUpdater(event_queue, task.id, task.contextId)

        try:
            async for item in self.agent.invoke(query, task.contextId):
                is_task_complete = item.get('is_task_complete', False)

                if not is_task_complete:
                    update_message = item.get('updates', 'Agent is processing...')
                    logger.debug(f"Agent update: {update_message}")
                    await updater.update_status(
                        TaskState.working,
                        new_agent_text_message(
                            update_message, task.contextId, task.id
                        ),
                    )
                else:
                    final_content = item.get('content', 'No content received.')
                    logger.info(f"Task {task.id} completed. Final content length: {len(final_content)} characters.")

                    message = new_agent_text_message(
                        final_content, task.contextId, task.id
                    )
                    await updater.update_status(
                        TaskState.completed, message
                    )
                    import asyncio
                    await asyncio.sleep(0.1)
                    break

        except Exception as e:
            logger.exception(f"Error during agent execution for task {task.id}: {e}")
            error_message = f"An error occurred: {str(e)}"
            await updater.update_status(
                TaskState.failed,
                new_agent_text_message(error_message, task.contextId, task.id),
            )
            raise

    async def cancel(
        self, request: RequestContext, event_queue: EventQueue
    ) -> Task | None:
        logger.warning(f"Attempted to cancel task {request.current_task.id if request.current_task else 'N/A'}. Cancellation is not supported.")
        raise ServerError(error=UnsupportedOperationError())
