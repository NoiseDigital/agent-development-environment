<p align="center">
  <img src="assets/noise_agent_platform_icon_transparent.png" alt="Noise Agent Platform" width="500" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-black?logo=next.js&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/Google_ADK-1.32.0-4285F4?logo=google&logoColor=white" alt="Google ADK 1.32.0" />
  <img src="https://img.shields.io/badge/MCP_Toolbox-1.1.0-00897B" alt="MCP Toolbox 1.1.0" />
  <img src="https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white" alt="Python 3.13" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white" alt="PostgreSQL 16" />
  <img src="https://github.com/noisedigital/agent-development-environment/actions/workflows/ci.yml/badge.svg" alt="CI" />
</p>

<p align="center">Internal platform for building, running, and iterating on AI agents. Provides a Next.js agent library UI, a multi-agent backend, and an MCP layer.</p>

## Prerequisites

- Docker Desktop
- Git installed and configured
- IAM permissions to nd-agentspace

## Getting Started

1. Enable automatic tasks:
   - Command Palette → **Tasks: Manage Automatic Tasks in Folder** → **Allow Automatic Tasks in Folder**

2. Open the repo in VS Code and select **Reopen in Container**.

3. The **Start Services** task runs automatically in a terminal panel and handles everything:

- Runs `scripts/devcontainer_start.sh`
- Creates `.env` from `.env.example` if it doesn't exist — review `GOOGLE_CLOUD_PROJECT` before first use
- Prompts for GCP authentication if credentials are missing — click the URL, sign in, paste the code back
- Starts all app services (`postgres`, `mcp`, `agent`, `frontend`)

   On subsequent opens, if credentials already exist the auth step is skipped and services start immediately.

1. Pre-commit hooks are installed automatically on first container create.

2. All services should be up and running, attachable in their own VSCode windows

> To restart services: **Terminal → Run Task → Start Services**
> To inspect compose logs: **Terminal → Run Task → Compose Logs**
> GCP credentials are stored in the `gcloud_config` Docker volume and shared with all services that need ADC.

**Git identity** — the devcontainer mounts your host `~/.gitconfig` so your name and email carry over automatically. If you see *"Author identity unknown"*, configure git on your host first:

```bash
git config --global user.email "you@example.com"
git config --global user.name "Your Name"
```

| URL | Description | Open On Startup |
|---|---|---|
| <http://localhost:3000> | Frontend chat UI | true |
| <http://localhost:8000/dev-ui> | ADK API / dev UI | true |
| <http://localhost:5000/ui> | MCP Toolbox UI | false |
| <http://localhost:5432> | Postgres DB | false |

## Project Structure

```
services/
├── frontend/               # Platform UI
├── backend/
│   ├── agents/             # ADK agents + FastAPI host
│   │   ├── adk_agents/     # Individual agent packages
│   │   └── main.py         # get_fast_api_app() entrypoint
│   ├── mcp/                # MCP Toolbox server + tools.yaml
│   └── database/           # Postgres
terraform/                  # GCP infrastructure
```

## Adding an Agent

The ADK server auto-discovers agents — no registration needed. See [CONTRIBUTING.md](CONTRIBUTING.md) for full steps and `agentConfig.tsx` display flags.

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch naming, commit conventions, CI requirements, and guidelines for adding agents and tools.

## Deployment

CI runs on every push and PR (`ruff`, `ESLint`, `tsc`, `terraform validate`, `docker compose config`). All checks must pass before merge.

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
