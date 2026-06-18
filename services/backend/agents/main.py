import datetime
import os
import secrets
from pathlib import Path
from typing import List

import httpx
import uvicorn
from fastapi import HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from google.adk.cli.fast_api import get_fast_api_app
from google import genai
from src.shared.asana_tokens import save_asana_token, get_asana_token, close_pool

AGENTS_DIR = str(Path(__file__).resolve().parent / "adk_agents")

app = get_fast_api_app(
    agents_dir=AGENTS_DIR,
    session_service_uri=os.environ.get("DATABASE_URL"),
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "http://localhost").split(","),
    web=True,
    trace_to_cloud=False,
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
        f"{m.role.upper()} {m.content[:300]}" for m in request.messages[-8:]
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
        raise HTTPException(
            status_code=500, detail=f"Failed to generate session name: {str(e)}"
        )


_state_store: dict[str, str] = {}


@app.get("/auth/asana/login")
async def asana_login(user_id: str):
    client_id = os.environ.get("ASANA_CLIENT_ID")
    redirect_uri = os.environ.get(
        "ASANA_OAUTH_REDIRECT_URI", "http://localhost:8000/auth/asana/callback"
    )
    state = secrets.token_urlsafe(16)
    _state_store[state] = user_id
    url = f"https://app.asana.com/-/oauth_authorize?client_id={client_id}&redirect_uri={redirect_uri}&response_type=code&state={state}"
    return RedirectResponse(url)


@app.get("/auth/asana/callback")
async def asana_callback(code: str, state: str):
    user_id = _state_store.pop(state, None)
    if not user_id:
        raise HTTPException(
            status_code=400, detail="Invalid or expired state parameter"
        )
    client_id = os.environ.get("ASANA_CLIENT_ID")
    client_secret = os.environ.get("ASANA_CLIENT_SECRET")
    redirect_uri = os.environ.get(
        "ASANA_OAUTH_REDIRECT_URI", "http://localhost:8000/auth/asana/callback"
    )
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://app.asana.com/-/oauth_token",
            data={
                "grant_type": "authorization_code",
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "code": code,
            },
        )
        response.raise_for_status()
        data = response.json()
    access_token = data["access_token"]
    refresh_token = data["refresh_token"]
    expires_in = data["expires_in"]
    expires_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(
        seconds=expires_in
    )
    user_info = data.get("data", {})
    asana_user_gid = user_info.get("gid")
    await save_asana_token(
        user_id=user_id,
        access_token=access_token,
        refresh_token=refresh_token,
        expires_at=expires_at,
        asana_user_gid=asana_user_gid,
    )
    frontend_url = os.environ.get("FRONTEND_BASE_URL", "http://localhost:3000")
    return RedirectResponse(f"{frontend_url}/settings/integrations?asana=connected")


@app.get("/auth/asana/status")
async def asana_status(user_id: str):
    token_data = await get_asana_token(user_id)
    return {"connected": token_data is not None}


@app.on_event("shutdown")
async def shutdown_event():
    await close_pool()


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
