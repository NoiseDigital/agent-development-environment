from typing import Optional

from google.adk.agents.callback_context import CallbackContext
from google.adk.models import LlmResponse, LlmRequest

from .constants import get_flash_model, get_pro_model

_PRO_KEYWORDS = [
    "build",
    "submit",
    "create",
    "finalize",
    "approve",
    "review",
    "reconcile",
    "timesheet",
    "docket",
    "discrepancy",
    "hours",
]

_COMPLEX_PROMPT_CHARS = 200


def choose_model_tier(user_text: str) -> str:
    lower = user_text.lower()

    if any(kw in lower for kw in _PRO_KEYWORDS):
        return get_pro_model()

    if len(user_text) > _COMPLEX_PROMPT_CHARS:
        return get_pro_model()

    return get_flash_model()


async def before_model_callback(
    callback_context: CallbackContext, llm_request: LlmRequest
) -> Optional[LlmResponse]:
    user_text = ""
    if llm_request.contents:
        for content in reversed(llm_request.contents):
            if getattr(content, "role", None) == "user":
                for part in content.parts or []:
                    if getattr(part, "text", None):
                        user_text = part.text
                        break
                if user_text:
                    break

    chosen = choose_model_tier(user_text)
    llm_request.model = chosen
    print(f"[model_router] selected={chosen} prompt={user_text[:80]!r}", flush=True)

    return None
