"""The GenUI response contract — what an agent returns to the chat UI.

Mirrors services/frontend/src/types/genui.ts. The structure is code-owned: an
agent returns `text` plus an ordered list of `ui` blocks drawn from the frontend
component catalog. A block's `component` names a renderer; `props` is that
component's payload (e.g. a chart spec).

Used as an ADK LlmAgent `output_schema` so the envelope is schema-enforced
rather than relying on the prompt to remember the JSON shape. Per-component
`props` schemas are validated frontend-side, so `props` stays a free object
here — keeping the response schema simple and robust for controlled generation.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class UIBlock(BaseModel):
    """One renderable block from the frontend component catalog."""

    component: str = Field(description="Catalog component name, e.g. 'chart'.")
    props: dict[str, Any] = Field(
        default_factory=dict,
        description="Payload for that component — e.g. a chart spec.",
    )


class AgentResponse(BaseModel):
    """The structured response an agent returns for one turn."""

    text: str = Field(description="Markdown analysis shown to the user.")
    ui: list[UIBlock] = Field(
        default_factory=list,
        description="Ordered renderable blocks shown beneath the text.",
    )
