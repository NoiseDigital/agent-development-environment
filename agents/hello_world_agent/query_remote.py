from vertexai import agent_engines
from utils.constants import get_resource_engine_id


RESOURCE_ENGINE_ID = get_resource_engine_id()
USER_ID = "user123"

remote_agent = agent_engines.get(RESOURCE_ENGINE_ID)

# New session
# remote_session = remote_agent.create_session(user_id=USER_ID)

# Existing session
remote_session = remote_agent.get_session(user_id=USER_ID, session_id="6415162714666041344")

for event in remote_agent.stream_query(
    user_id=USER_ID,
    session_id=remote_session["id"],
    message="What was my last question?",
):
  print(event)
