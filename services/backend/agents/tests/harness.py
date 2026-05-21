"""Agent test harness — run an agent on a message and inspect what comes back.

`AgentHarness` is the backend-agnostic interface: give it an agent name and a
message, get a structured `AgentRun` (final text + tool calls + any error).
`ADKHarness` is the only implementation today — all our agents are ADK — but a
remote / A2A backend is just another subclass plus a `get_harness()` branch.

Ad-hoc use (prints the reply):

    python -m tests.harness media_performance_agent "show me spend by platform"

Programmatic use:

    run = await get_harness().run("media_performance_agent", "hi")
    print(run.text, run.tool_names())
"""

from __future__ import annotations

import asyncio
import importlib
import sys
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# ADK discovers agents from here; the harness imports them the same way.
AGENTS_DIR = Path(__file__).resolve().parent.parent / "adk_agents"


@dataclass
class ToolCall:
    """One tool the agent invoked during a run."""

    name: str
    args: dict[str, Any]
    response: Any | None = None


@dataclass
class AgentRun:
    """The outcome of running an agent on a single message."""

    agent: str
    message: str
    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None

    def tool_names(self) -> list[str]:
        return [t.name for t in self.tool_calls]


class AgentHarness(ABC):
    """Runs an agent on a message and returns a structured result."""

    @abstractmethod
    async def run(
        self, agent: str, message: str, *, user_id: str = "harness"
    ) -> AgentRun: ...


class ADKHarness(AgentHarness):
    """Runs ADK agents via an in-memory Runner — no real DB or sessions touched."""

    @staticmethod
    def _load_root_agent(agent: str):
        if str(AGENTS_DIR) not in sys.path:
            sys.path.insert(0, str(AGENTS_DIR))
        module = importlib.import_module(agent)
        root = getattr(module, "root_agent", None)
        if root is None:
            raise ValueError(f"agent '{agent}' exposes no root_agent")
        return root

    async def run(
        self, agent: str, message: str, *, user_id: str = "harness"
    ) -> AgentRun:
        result = AgentRun(agent=agent, message=message)
        runner = None
        try:
            from google.adk.runners import InMemoryRunner
            from google.genai import types

            runner = InMemoryRunner(agent=self._load_root_agent(agent), app_name=agent)
            session_id = f"harness-{uuid.uuid4().hex[:8]}"
            await runner.session_service.create_session(
                app_name=agent, user_id=user_id, session_id=session_id
            )
            new_message = types.Content(role="user", parts=[types.Part(text=message)])

            calls_by_id: dict[str, ToolCall] = {}
            last_text = ""
            async for event in runner.run_async(
                user_id=user_id, session_id=session_id, new_message=new_message
            ):
                for part in (event.content.parts if event.content else None) or []:
                    fc = getattr(part, "function_call", None)
                    if fc is not None:
                        call = ToolCall(name=fc.name, args=dict(fc.args or {}))
                        result.tool_calls.append(call)
                        if fc.id:
                            calls_by_id[fc.id] = call
                    fr = getattr(part, "function_response", None)
                    if fr is not None and fr.id in calls_by_id:
                        calls_by_id[fr.id].response = fr.response
                    if getattr(part, "text", None):
                        last_text = part.text
                        if event.is_final_response():
                            result.text = part.text
            if not result.text:
                result.text = last_text
        except Exception as e:  # noqa: BLE001 — the harness reports failure, never raises
            result.error = f"{type(e).__name__}: {e}"
        finally:
            if runner is not None and hasattr(runner, "close"):
                try:
                    await runner.close()
                except Exception:  # noqa: BLE001
                    pass
        return result


def get_harness(kind: str = "adk") -> AgentHarness:
    """Return a harness for the given backend (only 'adk' today)."""
    if kind == "adk":
        return ADKHarness()
    raise ValueError(f"unknown harness kind: {kind!r}")


async def _main() -> None:
    if len(sys.argv) < 3:
        print('usage: python -m tests.harness <agent_name> "<message>"')
        raise SystemExit(2)
    agent, message = sys.argv[1], sys.argv[2]
    run = await get_harness().run(agent, message)

    print(f"agent:   {run.agent}")
    print(f"message: {run.message}")
    if run.tool_calls:
        print("tool calls:")
        for t in run.tool_calls:
            print(f"  - {t.name}({t.args})")
    print("-" * 64)
    print(run.text or f"(no text)   error: {run.error}")
    if run.error and run.text:
        print(f"\n[error: {run.error}]")


if __name__ == "__main__":
    asyncio.run(_main())
