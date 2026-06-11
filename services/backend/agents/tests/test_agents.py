"""Behaviour smoke tests — driven by tests/agents.yaml.

Each case runs a message through the harness and checks its `expect` block.
These are REAL agent runs (live Gemini + MCP), so run them inside the agent
container:

    docker compose exec agent uv run pytest tests -v
"""

import os
from pathlib import Path

import pytest
import yaml

from tests.harness import get_harness

# These are REAL agent runs (live Gemini + MCP). Skip the whole suite where no
# model backend is configured (e.g. plain CI) so missing credentials read as
# "skipped" rather than "failed". Run it in the agent container, or set
# GOOGLE_API_KEY / GEMINI_API_KEY (AI Studio) or GOOGLE_GENAI_USE_VERTEXAI=1
# (+ GOOGLE_CLOUD_PROJECT) for Vertex.
_LIVE_BACKEND = bool(
    os.getenv("GOOGLE_API_KEY")
    or os.getenv("GEMINI_API_KEY")
    or os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").lower() in {"1", "true"}
)

pytestmark = pytest.mark.skipif(
    not _LIVE_BACKEND,
    reason="live agent E2E (Gemini + MCP) — no model backend configured; set "
    "GOOGLE_API_KEY/GEMINI_API_KEY or GOOGLE_GENAI_USE_VERTEXAI to run.",
)

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

    # `ui`: a single component name OR a list of names that must all be present.
    if "ui" in expect:
        required = expect["ui"] if isinstance(expect["ui"], list) else [expect["ui"]]
        missing = [c for c in required if c not in run.ui_components]
        assert not missing, (
            f"expected UI components {required}; got {run.ui_components or 'none'}\n"
            f"final text: {run.text[:300]}"
        )

    # `no_ui`: explicit negative — the reply must NOT have any UI blocks.
    if expect.get("no_ui"):
        assert not run.ui_components, (
            f"expected no UI blocks; got {run.ui_components}\n"
            f"final text: {run.text[:300]}"
        )

    # `forbidden_ui`: components that must NOT appear, while others are fine.
    # Use for assertions like "must not emit an `action` block" without
    # constraining what *does* appear.
    if "forbidden_ui" in expect:
        banned = expect["forbidden_ui"]
        if isinstance(banned, str):
            banned = [banned]
        present = [c for c in banned if c in run.ui_components]
        assert not present, (
            f"forbidden UI components present: {present}; got {run.ui_components}"
        )

    # `tools`: bool (any tool used) OR a list of names that must all be called.
    if "tools" in expect:
        names = run.tool_names()
        if isinstance(expect["tools"], list):
            missing = [t for t in expect["tools"] if t not in names]
            assert not missing, (
                f"expected tool calls {expect['tools']}; got {names or 'none'}"
            )
        elif expect["tools"]:
            assert names, (
                f"expected at least one tool call; got none\nreply: {run.text[:200]}"
            )

    # `forbidden_tools`: names that must NOT appear in the turn's tool calls.
    # Use to pin "this path skips X" — e.g. greeting fast-path must not call
    # ChoicesAgent; modify-previous-chart must not call VegaChartsAgent.
    if "forbidden_tools" in expect:
        banned = expect["forbidden_tools"]
        if isinstance(banned, str):
            banned = [banned]
        names = run.tool_names()
        present = [t for t in banned if t in names]
        assert not present, (
            f"forbidden tool calls present: {present}; got {names or 'none'}"
        )
