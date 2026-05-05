import os

from pathlib import Path
from typing import List

import uvicorn
from fastapi import HTTPException
from pydantic import BaseModel
from google.adk.cli.fast_api import get_fast_api_app
from google import genai

AGENTS_DIR = str(Path(__file__).resolve().parent / "adk_agents")

app = get_fast_api_app(
    agents_dir=AGENTS_DIR,
    session_service_uri=os.environ.get("DATABASE_URL"),
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "http://localhost").split(","),
    web=True,
    trace_to_cloud=False
)


_genai_client = genai.Client()

class MessageSnippet(BaseModel):
    content: str
    role: str


class NameSessionRequest(BaseModel):
    messages: List[MessageSnippet]

class NameSessionResponse(BaseModel):
    name: str

@app.post("/name_session", response_model=NameSessionResponse)
async def name_session(request: NameSessionRequest) -> NameSessionResponse:
    """Generate a short description name for a chat session based on the messages in the session."""
    context = "\n".join(
        f"{m.role.upper()} {m.content[:300]}"
        for m in request.messages[-8:]
    )

    prompt = (
        "You are a helpful assistant for naming chat sessions. "
        f"Here is the context of the chat session:\n{context}"
        "Return ONLY the name, no quotes, no explanation, no formatting, just the name. "
    )

    try:
        response = _genai_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        name = response.text.strip()
        if not name:
            raise ValueError("Generated name is empty")
        return NameSessionResponse(name=name[:50])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate session name: {str(e)}")
    
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))