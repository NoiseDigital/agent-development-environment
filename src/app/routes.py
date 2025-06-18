from fastapi import APIRouter, Body
from vertexai import agent_engines

router = APIRouter()

GOOGLE_CLOUD_PROJECT = "probable-summer-238718"
GOOGLE_CLOUD_LOCATION = "us-central1"

@router.get("/")
def root():
    return {"message": "Welcome to the Agent Engine Service API!"}

@router.post("/create_session")
async def create_session(user_id: str = Body(..., embed=True), reasoning_engine_id: str = Body(..., embed=True)):
    remote_agent = agent_engines.get(
        f"projects/{GOOGLE_CLOUD_PROJECT}/locations/{GOOGLE_CLOUD_LOCATION}/reasoningEngines/{reasoning_engine_id}"
    )
    remote_session = remote_agent.create_session(user_id=user_id)
    return remote_session

@router.post("/chat")
async def chat_with_agent(
    user_id: str = Body(..., embed=True),
    session_id: str = Body(..., embed=True),
    message: str = Body(..., embed=True),
    reasoning_engine_id: str = Body(..., embed=True)
):
    remote_agent = agent_engines.get(
        f"projects/{GOOGLE_CLOUD_PROJECT}/locations/{GOOGLE_CLOUD_LOCATION}/reasoningEngines/{reasoning_engine_id}"
    )
    response = remote_agent.stream_query(
        user_id=user_id,
        session_id=session_id,
        message=message,
    )
    return {"response": response}