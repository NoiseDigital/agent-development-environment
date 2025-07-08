from vertexai import agent_engines

adk_app = agent_engines.get("8348011247563702272")

sessions = adk_app.list_sessions(user_id="mockUser")

print(sessions)

session = adk_app.get_session(user_id="mockUser", session_id="1665138342255132672")

print(session)