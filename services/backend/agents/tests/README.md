# Agent test harness

Run an agent on a message and inspect what comes back — outside the chat UI.

## See what an agent replies (ad-hoc)

```
docker compose exec agent uv run python -m tests.harness media_performance_agent "show me spend by platform"
```

Prints the agent's tool calls and final text.

## Run the smoke tests

```
docker compose exec agent uv run pytest tests -v
```

The tests make real agent runs (live Gemini + MCP), so run them inside the
agent container — it has the credentials and the MCP services.

## Extending

`AgentHarness` in `harness.py` is the backend-agnostic interface; `ADKHarness`
is the only implementation today (all our agents are ADK). Another backend —
a remote Agent Engine, an A2A endpoint — is a new `AgentHarness` subclass plus
a branch in `get_harness()`. The tests and CLI stay unchanged.
