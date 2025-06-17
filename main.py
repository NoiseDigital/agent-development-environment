from fastapi import FastAPI, Body
from vertexai import agent_engines

GOOGLE_CLOUD_PROJECT="probable-summer-238718"
GOOGLE_CLOUD_LOCATION="us-central1"

app = FastAPI()

@app.get("/")
def root():
    return {"message": "Welcome to the Agent Engine Service API!"}

@app.post("/create_session")
async def create_session(user_id: str = Body(..., embed=True), reasoning_engine_id: str = Body(..., embed=True)):
    """
    Create a new session for the remote Vertex AI agent.
    """
    remote_agent = agent_engines.get(
        f"projects/{GOOGLE_CLOUD_PROJECT}/locations/{GOOGLE_CLOUD_LOCATION}/reasoningEngines/{reasoning_engine_id}"
    )
    remote_session = remote_agent.create_session(user_id=user_id)
    return remote_session

@app.post("/chat")
async def chat_with_agent(
    user_id: str = Body(..., embed=True),
    session_id: str = Body(..., embed=True),
    message: str = Body(..., embed=True),
    reasoning_engine_id: str = Body(..., embed=True)
):
    """
    Send a chat message to the remote Vertex AI agent in a specific session and return the response.
    """
    remote_agent = agent_engines.get(
        f"projects/{GOOGLE_CLOUD_PROJECT}/locations/{GOOGLE_CLOUD_LOCATION}/reasoningEngines/{reasoning_engine_id}"
    )
    response = remote_agent.stream_query(
            user_id=user_id,
            session_id=session_id,
            message=message,
    )
    return {"response": response}