# Noise Agent Platform

Internal platform for building, running, and iterating on AI agents. Provides a Next.js agent library UI, and a multi-agent backend, and an MCP layer.

## Stack

| Service | Tech | Port |
|---|---|---|
| `frontend` | Next.js 15 | 3000 |
| `agent` | Google ADK + FastAPI + uvicorn | 8000 |
| `mcp` | MCP Toolbox v1.1.0 | 5000 |
| `postgres` | PostgreSQL 16 | 5432 |

## Prerequisites

- Docker Desktop
- Copy `.env.example` to `.env` and fill in GCP project details:
  ```bash
  cp .env.example .env
  ```

## Getting Started

```bash
git clone <repo>
cd agent-development-environment
./first_start.sh
```

`first_start.sh` detects whether GCP credentials exist in the Docker volume, opens a browser for `gcloud auth application-default login` if not, then starts all services. On subsequent runs, use `docker compose up` directly — credentials are already cached in the volume.

```bash
docker compose up           # normal start
docker compose up --build   # rebuild images
docker compose up -d        # detached mode
```

> **Windows?** Use `first_start.ps1` instead of `first_start.sh`.

| URL | Description |
|---|---|
| http://localhost:3000 | Frontend chat UI |
| http://localhost:8000/dev-ui | ADK API / dev UI |
| http://localhost:5000/ui | MCP Toolbox UI |

## Project Structure

```
services/
├── frontend/               # Next.js chat UI
├── backend/
│   ├── agents/             # ADK agents + FastAPI host
│   │   ├── adk_agents/     # Individual agent packages
│   │   └── main.py         # get_fast_api_app() entrypoint
│   ├── mcp/                # MCP Toolbox server + tools.yaml
│   └── database/           # Postgres
terraform/                  # GCP infrastructure
```

## Adding an Agent

1. Create a directory under `services/backend/agents/adk_agents/<agent_name>/`
2. Add `__init__.py` and `agent.py` with a `root_agent` variable
3. The ADK server auto-discovers it — no registration needed
4. Add display config in `services/frontend/src/config/agentConfig.tsx`

**Minimal `agent.py`:**
```python
from google.adk.agents import Agent

root_agent = Agent(
    name="my_agent",
    model="gemini-2.5-flash",
    instruction="You are a helpful assistant.",
)
```

## Using MCP Toolbox

Tools are defined in `services/backend/mcp/mcp-toolbox/tools.yaml` using the v1.0+ flat document format. The MCP service is available at `http://mcp:5000` inside the Docker network.

> **Note:** MCP Toolbox server v1.1.0 speaks protocol `2025-03-26`. Pass `protocol=Protocol.MCP_v20250326` to `ToolboxSyncClient` to avoid a version mismatch error until the server supports a newer protocol spec.

```python
import os
from toolbox_core import ToolboxSyncClient
from toolbox_core.protocol import Protocol

TOOLBOX_ENDPOINT = os.getenv("TOOLBOX_ENDPOINT", "http://mcp:5000")
toolbox = ToolboxSyncClient(TOOLBOX_ENDPOINT, protocol=Protocol.MCP_v20250326)
tools = toolbox.load_toolset("my_toolset")
```

## Environment Variables

Key variables with their defaults (set in `.env` or shell to override):

| Variable | Default | Description |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | `nd-agentspace-sbx` | GCP project |
| `GOOGLE_CLOUD_LOCATION` | `northamerica-northeast1` | GCP region |
| `GOOGLE_MODEL_NAME` | `gemini-2.5-flash` | Default model |
| `TOOLBOX_ENDPOINT` | `http://mcp:5000` | MCP Toolbox URL |
| `AGENTS_BASE_URL` | `http://localhost:8000` | Agent API (browser-side) |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch naming, commit conventions, and guidelines for adding agents and tools.

## Deployment

TODO CI/CD

### MCP Toolbox to Cloud Run

```bash
export IMAGE=us-central1-docker.pkg.dev/database-toolbox/toolbox/toolbox:1.1.0
gcloud run deploy mcp-toolbox \
  --image $IMAGE \
  --service-account toolbox-identity \
  --region us-central1 \
  --set-secrets "/app/tools.yaml=tools:latest" \
  --args="--config=/app/tools.yaml","--address=0.0.0.0","--port=8080"
```
