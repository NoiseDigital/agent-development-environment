"""Session-name generation — suggests a short title from a chat's messages.

This endpoint only *generates* a candidate name; persisting the chosen name is
handled by :mod:`api.sessions`.
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException
from google import genai
from pydantic import BaseModel

router = APIRouter(tags=["naming"])

_genai_client = genai.Client()


class MessageSnippet(BaseModel):
    content: str
    role: str


class NameSessionRequest(BaseModel):
    messages: List[MessageSnippet]


class NameSessionResponse(BaseModel):
    name: str


@router.post("/name_session", response_model=NameSessionResponse)
async def name_session(request: NameSessionRequest) -> NameSessionResponse:
    """Generate a short descriptive name for a chat session from its messages."""
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
