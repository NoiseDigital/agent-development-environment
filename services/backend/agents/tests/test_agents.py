"""Behaviour smoke tests — driven by tests/agents.yaml.

Each case runs a message through the harness and checks its `expect` block.
These are REAL agent runs (live Gemini + MCP), so run them inside the agent
container:

    docker compose exec agent uv run pytest tests -v
"""

import json
from pathlib import Path

import pytest
import yaml

from tests.harness import get_harness

_CASES_FILE = Path(__file__).parent / "agents.yaml"


def _load_cases():
    """Build a pytest param per YAML case; a case's `xfail` key marks it known-failing."""
    data = yaml.safe_load(_CASES_FILE.read_text()) or {}
    params = []
    for agent, cases in data.items():
        for case in cases:
            marks = (
                [pytest.mark.xfail(reason=case["xfail"], strict=False)]
                if case.get("xfail")
                else []
            )
            params.append(
                pytest.param(agent, case, id=f"{agent}::{case['name']}", marks=marks)
            )
    return params


def _ui_components(text: str) -> list[str]:
    """Parse the { text, ui } envelope from a reply and list its component names."""
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return []
    try:
        payload = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return []
    ui = payload.get("ui") if isinstance(payload, dict) else None
    return [b.get("component") for b in ui or [] if isinstance(b, dict)]


@pytest.fixture(scope="session")
def harness():
    return get_harness()


async def test_harness_handles_unknown_agent(harness):
    """Harness self-check — a bad agent name surfaces as an error, never raises."""
    run = await harness.run("no_such_agent", "hello")
    assert not run.ok and run.error


@pytest.mark.parametrize("agent,case", _load_cases())
async def test_agent_behaviour(harness, agent, case):
    run = await harness.run(agent, case["message"])
    expect = case.get("expect", {})

    if expect.get("ok", True):
        assert run.ok, run.error
        assert run.text.strip(), "expected a non-empty reply"

    if "ui" in expect:
        components = _ui_components(run.text)
        assert expect["ui"] in components, (
            f"expected a '{expect['ui']}' UI block; got {components or 'none'}\n"
            f"reply: {run.text[:300]}"
        )

    if expect.get("tools"):
        assert run.tool_calls, f"expected tool calls; got none\nreply: {run.text[:200]}"
