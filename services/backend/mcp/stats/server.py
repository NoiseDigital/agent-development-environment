"""MCP server exposing the statistics engine as tools.

Wraps the deterministic correlation/regression/QA engine so ADK agents can
invoke it. Each tool resolves a source reference, loads the DataFrame, and
returns a JSON-serializable result. Follows the SSE pattern of mcp/math.
"""

import json
import logging
import os
from typing import Optional

import uvicorn
from dotenv import load_dotenv

from mcp import types as mcp_types
from mcp.server.lowlevel import Server
from mcp.server.sse import SseServerTransport
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse, Response
from starlette.routing import Mount, Route

from google.adk.tools.function_tool import FunctionTool
from google.adk.tools.mcp_tool.conversion_utils import adk_to_mcp_tool_type

import competitive
import engine
from resolve import load_source


class _MuteLivenessAccessLog(logging.Filter):
    """Drop the exact liveness-probe access line (`GET /health`, any status) —
    zero-signal noise. Narrow on purpose: every other route and their failures
    stay visible."""

    def filter(self, record: logging.LogRecord) -> bool:
        return '"GET /health HTTP' not in record.getMessage()


logging.getLogger("uvicorn.access").addFilter(_MuteLivenessAccessLog())


# --- Tool implementations -----------------------------------------------------


def correlate(
    source: str,
    set_a: Optional[list[str]] = None,
    set_b: Optional[list[str]] = None,
    method: str = "pearson",
    alpha: float = 0.05,
    lag: int = 0,
    top_n: int = 20,
    winsorize: bool = False,
    log1p: bool = False,
    zscore: bool = False,
    difference: bool = False,
    group_col: str = "",
    group_val: str = "",
    time_col: str = "",
    sheet: str = "",
) -> dict:
    """Compute a Pearson or Spearman correlation matrix for a data source.

    Correlates Set A columns against Set B columns (drivers vs KPIs). If Set B
    is empty a symmetric Set A x Set A matrix is produced. Returns the matrix,
    p-values, significance mask, ranked top signals, and slider metadata.

    Args:
        source: Source URI — "upload:<id>" or "bigquery:<dataset>.<table>".
        set_a: Driver/feature columns. Defaults to all numeric columns.
        set_b: KPI columns to correlate against Set A. Optional.
        method: 'pearson' (linear) or 'spearman' (rank/monotonic).
        alpha: P-value threshold for the significance mask.
        lag: Periods to shift Set B before correlating (tests lead/lag effects).
        top_n: How many strongest pairs to return in top_signals.
        winsorize: Clip numeric columns to the 1st-99th percentile.
        log1p: Apply ln(1+x) to non-negative numeric columns.
        zscore: Standardize numeric columns.
        difference: Use first differences (de-trends the series).
        group_col: Column to segment by before analysis.
        group_val: Value within group_col to filter to.
        time_col: Column used to order rows before lag/difference.
        sheet: Worksheet name for multi-sheet Excel uploads.
    """
    df = load_source(source, sheet or None)
    return engine.correlate(
        df,
        set_a,
        set_b,
        method,
        alpha,
        lag,
        top_n,
        winsorize,
        log1p,
        zscore,
        difference,
        group_col,
        group_val,
        time_col,
    )


def regress(
    source: str,
    y: str,
    x: list[str],
    add_constant: bool = True,
    zscore: bool = False,
    difference: bool = False,
    lag: int = 0,
    group_col: str = "",
    group_val: str = "",
    time_col: str = "",
    sheet: str = "",
) -> dict:
    """Run an ordinary least squares (OLS) regression on a data source.

    Args:
        source: Source URI — "upload:<id>" or "bigquery:<dataset>.<table>".
        y: Target/outcome column.
        x: One or more predictor columns.
        add_constant: Include an intercept term.
        zscore: Standardize columns before fitting.
        difference: Use first differences before fitting.
        lag: Periods to shift the X columns.
        group_col: Column to segment by.
        group_val: Value within group_col to filter to.
        time_col: Column used to order rows before lag/difference.
        sheet: Worksheet name for multi-sheet Excel uploads.
    """
    df = load_source(source, sheet or None)
    return engine.regress(
        df,
        y,
        x,
        add_constant,
        zscore,
        difference,
        lag,
        group_col,
        group_val,
        time_col,
    )


def qa_report(source: str, time_col: str = "", sheet: str = "") -> dict:
    """Run data-quality checks on a source before analysis.

    Args:
        source: Source URI — "upload:<id>" or "bigquery:<dataset>.<table>".
        time_col: Optional time column to validate date formatting.
        sheet: Worksheet name for multi-sheet Excel uploads.
    """
    df = load_source(source, sheet or None)
    return engine.qa_report(df, time_col)


def describe_source(source: str, sheet: str = "") -> dict:
    """List a source's columns with dtype classification and row count.

    Args:
        source: Source URI — "upload:<id>" or "bigquery:<dataset>.<table>".
        sheet: Worksheet name for multi-sheet Excel uploads.
    """
    df = load_source(source, sheet or None)
    return engine.describe(df)


_tools = {
    t.name: t
    for t in (
        FunctionTool(correlate),
        FunctionTool(regress),
        FunctionTool(qa_report),
        FunctionTool(describe_source),
    )
}


# --- MCP server ---------------------------------------------------------------

app = Server("stats-mcp-server")
sse = SseServerTransport("/messages/")


@app.list_tools()
async def list_tools() -> list[mcp_types.Tool]:
    return [adk_to_mcp_tool_type(t) for t in _tools.values()]


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[mcp_types.TextContent]:
    tool = _tools.get(name)
    if tool is None:
        return [
            mcp_types.TextContent(
                type="text", text=json.dumps({"error": f"Unknown tool '{name}'"})
            )
        ]
    try:
        result = await tool.run_async(args=arguments, tool_context=None)
        return [
            mcp_types.TextContent(type="text", text=json.dumps(result, default=str))
        ]
    except Exception as e:  # noqa: BLE001 — surface tool errors back to the agent
        return [mcp_types.TextContent(type="text", text=json.dumps({"error": str(e)}))]


async def handle_sse(request):
    async with sse.connect_sse(
        request.scope, request.receive, request._send
    ) as streams:
        await app.run(streams[0], streams[1], app.create_initialization_options())
    # Starlette >=0.49 requires a route endpoint to return a Response; the SSE
    # stream itself was already sent inside connect_sse via request._send.
    return Response()


# --- Plain HTTP API -----------------------------------------------------------
# The Analyze page calls these directly — browsers cannot speak the MCP protocol.


async def http_correlate(request):
    try:
        b = await request.json()
        df = load_source(b["source"], b.get("sheet") or None)
        result = engine.correlate(
            df,
            b.get("set_a"),
            b.get("set_b"),
            b.get("method", "pearson"),
            b.get("alpha", 0.05),
            b.get("lag", 0),
            b.get("top_n", 20),
            b.get("winsorize", False),
            b.get("log1p", False),
            b.get("zscore", False),
            b.get("difference", False),
            b.get("group_col", ""),
            b.get("group_val", ""),
            b.get("time_col", ""),
        )
        return JSONResponse(result)
    except Exception as e:  # noqa: BLE001
        return JSONResponse({"error": str(e)}, status_code=400)


async def http_regress(request):
    try:
        b = await request.json()
        df = load_source(b["source"], b.get("sheet") or None)
        result = engine.regress(
            df,
            b["y"],
            b["x"],
            b.get("add_constant", True),
            b.get("zscore", False),
            b.get("difference", False),
            b.get("lag", 0),
            b.get("group_col", ""),
            b.get("group_val", ""),
            b.get("time_col", ""),
        )
        return JSONResponse(result)
    except Exception as e:  # noqa: BLE001
        return JSONResponse({"error": str(e)}, status_code=400)


async def http_pairs(request):
    try:
        b = await request.json()
        df = load_source(b["source"], b.get("sheet") or None)
        result = engine.pairs(
            df,
            b["a"],
            b["b"],
            b.get("method", "pearson"),
            b.get("lag", 0),
            b.get("winsorize", False),
            b.get("log1p", False),
            b.get("zscore", False),
            b.get("difference", False),
            b.get("group_col", ""),
            b.get("group_val", ""),
            b.get("time_col", ""),
        )
        return JSONResponse(result)
    except Exception as e:  # noqa: BLE001
        return JSONResponse({"error": str(e)}, status_code=400)


async def http_qa(request):
    try:
        b = await request.json()
        df = load_source(b["source"], b.get("sheet") or None)
        return JSONResponse(engine.qa_report(df, b.get("time_col", "")))
    except Exception as e:  # noqa: BLE001
        return JSONResponse({"error": str(e)}, status_code=400)


async def http_profile(request):
    try:
        b = await request.json()
        df = load_source(b["source"], b.get("sheet") or None)
        return JSONResponse(engine.profile(df))
    except Exception as e:  # noqa: BLE001
        return JSONResponse({"error": str(e)}, status_code=400)


async def http_describe(request):
    try:
        b = await request.json()
        df = load_source(b["source"], b.get("sheet") or None)
        return JSONResponse(engine.describe(df))
    except Exception as e:  # noqa: BLE001
        return JSONResponse({"error": str(e)}, status_code=400)


async def http_competitive(request):
    try:
        b = await request.json()
        df = load_source(b["source"], b.get("sheet") or None)
        return JSONResponse(
            competitive.run(
                df,
                mode=b.get("mode", "basic"),
                maturity=b.get("maturity"),
                dimension=b.get("dimension", "auto"),
                scope=b.get("scope", "market"),
            ),
        )
    except Exception as e:  # noqa: BLE001
        return JSONResponse({"error": str(e)}, status_code=400)


async def http_competitive_forecast(request):
    try:
        b = await request.json()
        df = load_source(b["source"], b.get("sheet") or None)
        return JSONResponse(
            competitive.forecast(
                df,
                mode=b.get("mode", "advanced"),
                maturity=b.get("maturity"),
                scenario=b.get("scenario"),
                dimension=b.get("dimension", "auto"),
                scope=b.get("scope", "market"),
            ),
        )
    except Exception as e:  # noqa: BLE001
        return JSONResponse({"error": str(e)}, status_code=400)


async def http_health(request):
    return JSONResponse({"ok": True})


starlette_app = Starlette(
    debug=True,
    routes=[
        Route("/sse", endpoint=handle_sse),
        Mount("/messages/", app=sse.handle_post_message),
        Route("/health", endpoint=http_health),
        Route("/api/correlate", endpoint=http_correlate, methods=["POST"]),
        Route("/api/regress", endpoint=http_regress, methods=["POST"]),
        Route("/api/pairs", endpoint=http_pairs, methods=["POST"]),
        Route("/api/qa", endpoint=http_qa, methods=["POST"]),
        Route("/api/describe", endpoint=http_describe, methods=["POST"]),
        Route("/api/profile", endpoint=http_profile, methods=["POST"]),
        Route("/api/competitive", endpoint=http_competitive, methods=["POST"]),
        Route(
            "/api/competitive_forecast",
            endpoint=http_competitive_forecast,
            methods=["POST"],
        ),
    ],
    middleware=[
        Middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_methods=["*"],
            allow_headers=["*"],
        )
    ],
)


if __name__ == "__main__":
    load_dotenv()
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", 8080))
    print(f"Launching stats MCP server on {host}:{port} (sse)...")
    uvicorn.run(starlette_app, host=host, port=port)
