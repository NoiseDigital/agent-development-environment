"""Dashboard query route — exercises the tool allowlist, the async toolbox
client wiring, and the response-normalisation seam.

We stub the toolbox client so the route runs end-to-end (allowlist check,
load_tool, invoke, normalise) without touching the actual MCP container.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

import api.dashboards.routes as dashboards_module
from main import app


class FakeTool:
    """Stand-in for a toolbox-loaded async tool — call returns whatever the
    test queued."""

    def __init__(self, result: Any) -> None:
        self._result = result

    async def __call__(self, **_kwargs: Any) -> Any:
        return self._result


class FakeToolboxClient:
    def __init__(
        self,
        tool_result: Any = None,
        load_raises: Exception | None = None,
        call_raises: Exception | None = None,
    ) -> None:
        self.tool_result = tool_result
        self.load_raises = load_raises
        self.call_raises = call_raises
        self.loaded: list[str] = []

    async def load_tool(self, name: str) -> FakeTool:
        if self.load_raises:
            raise self.load_raises
        self.loaded.append(name)
        if self.call_raises:

            async def _raise(**_: Any) -> Any:
                raise self.call_raises  # type: ignore[misc]

            return _raise  # type: ignore[return-value]
        return FakeTool(self.tool_result)


@pytest.fixture
def dashboards_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    return TestClient(app)


def patch_toolbox(monkeypatch: pytest.MonkeyPatch, fake: FakeToolboxClient) -> None:
    monkeypatch.setattr(dashboards_module, "get_toolbox_client", lambda: fake)


class TestAllowlist:
    def test_rejects_tool_not_on_the_allowlist(
        self, dashboards_client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        fake = FakeToolboxClient(tool_result=[])
        patch_toolbox(monkeypatch, fake)
        r = dashboards_client.post(
            "/api/v1/dashboards/query",
            json={"tool": "DROP_TABLE_users", "params": {}},
        )
        assert r.status_code == 400
        assert "unknown tool" in r.json()["detail"]
        assert fake.loaded == []  # never even attempted to load

    def test_accepts_an_allowlisted_tool(
        self, dashboards_client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        fake = FakeToolboxClient(tool_result=[{"k": "v"}])
        patch_toolbox(monkeypatch, fake)
        r = dashboards_client.post(
            "/api/v1/dashboards/query",
            json={"tool": "performance_trend", "params": {"date_from": "2024-01-01"}},
        )
        assert r.status_code == 200
        assert fake.loaded == ["performance_trend"]


class TestResponseShape:
    def test_passes_tool_rows_through_normalise(
        self, dashboards_client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # JSON-encoded string is the most common async-client shape — verify
        # the route runs it through `normalise_rows` so the frontend sees
        # native numbers not strings.
        rows = [{"name": "a", "spend": "100.5"}, {"name": "b", "spend": "75"}]
        patch_toolbox(monkeypatch, FakeToolboxClient(tool_result=json.dumps(rows)))
        r = dashboards_client.post(
            "/api/v1/dashboards/query",
            json={"tool": "metric_totals", "params": {}},
        )
        assert r.status_code == 200
        body = r.json()
        assert body == {
            "rows": [
                {"name": "a", "spend": 100.5},
                {"name": "b", "spend": 75.0},
            ]
        }

    def test_empty_result_returns_empty_rows(
        self, dashboards_client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        patch_toolbox(monkeypatch, FakeToolboxClient(tool_result=None))
        r = dashboards_client.post(
            "/api/v1/dashboards/query",
            json={"tool": "metric_totals", "params": {}},
        )
        assert r.status_code == 200
        assert r.json() == {"rows": []}


class TestUpstreamErrorMapping:
    def test_load_tool_failure_becomes_502(
        self, dashboards_client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        patch_toolbox(
            monkeypatch, FakeToolboxClient(load_raises=RuntimeError("mcp down"))
        )
        r = dashboards_client.post(
            "/api/v1/dashboards/query",
            json={"tool": "metric_totals", "params": {}},
        )
        assert r.status_code == 502
        assert "toolbox failed to load tool" in r.json()["detail"]

    def test_tool_invocation_failure_becomes_400(
        self, dashboards_client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # An invocation error (bad params, BigQuery rejected the SQL) is a
        # client-side problem from the gateway's POV — bad request, not bad
        # gateway.
        patch_toolbox(
            monkeypatch, FakeToolboxClient(call_raises=ValueError("bad date"))
        )
        r = dashboards_client.post(
            "/api/v1/dashboards/query",
            json={"tool": "metric_totals", "params": {"date_from": "garbage"}},
        )
        assert r.status_code == 400
        assert "toolbox query failed" in r.json()["detail"]


class TestBadRequest:
    def test_missing_tool_field_is_a_422(self, dashboards_client: TestClient) -> None:
        r = dashboards_client.post("/api/v1/dashboards/query", json={"params": {}})
        assert r.status_code == 422

    def test_params_defaults_to_empty_dict(
        self, dashboards_client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        fake = FakeToolboxClient(tool_result=[{"v": 1}])
        patch_toolbox(monkeypatch, fake)
        r = dashboards_client.post(
            "/api/v1/dashboards/query",
            json={"tool": "metric_totals"},
        )
        assert r.status_code == 200
