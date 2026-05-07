#!/bin/bash
# Runs inside the workspace devcontainer on every attach (postStartCommand).
# 1. Copies .env.example → .env on first run (idempotent).
# 2. Prompts for GCP ADC login if credentials are missing.
# 3. Starts sibling app services via the host Docker socket (DooD — not Docker-in-Docker).

set -euo pipefail

export LANG="${LANG:-C.UTF-8}"
export LANGUAGE="${LANGUAGE:-C.UTF-8}"
export LC_ALL="${LC_ALL:-C.UTF-8}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CREDS_FILE="/root/.config/gcloud/application_default_credentials.json"

# Resolve the host-side project root by inspecting our own container's bind mount.
# hostname in a Docker container is the short container ID.
# We look for the bind mount whose destination is our workspaceFolder.
CONTAINER_ID="$(hostname)"
HOST_PROJECT_ROOT="$(docker inspect "$CONTAINER_ID" \
    --format '{{range .Mounts}}{{if eq .Destination "/workspaces/agent-platform"}}{{.Source}}{{end}}{{end}}' \
    2>/dev/null || true)"

if [ -z "$HOST_PROJECT_ROOT" ]; then
    echo "⚠ Could not detect host project path from container mounts."
    echo "  Falling back to container path — bind mounts may not resolve correctly."
    HOST_PROJECT_ROOT="$PROJECT_ROOT"
fi

cd "$PROJECT_ROOT"

# ── 1. Bootstrap .env ─────────────────────────────────────────────────────────
if [ ! -f .env ]; then
    cp .env.example .env
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  Created .env from .env.example                              ║"
    echo "║  Review GOOGLE_CLOUD_PROJECT and other values before use.    ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
fi

# Bootstrap .env files for optional (profile-based) MCP servers.
for mcp_dir in "$PROJECT_ROOT"/services/backend/mcp/_images/*/; do
    example="$mcp_dir/.env.example"
    dotenv="$mcp_dir/.env"
    if [ -f "$example" ] && [ ! -f "$dotenv" ]; then
        cp "$example" "$dotenv"
        echo "  Created $dotenv — fill in credentials before starting this MCP server."
    fi
done

# Export .env so gcloud quota-project and compose pick up the values.
set -a
# shellcheck disable=SC1091 # .env is created from .env.example during bootstrap.
. ./.env
set +a

# ── 2. GCP Authentication ─────────────────────────────────────────────────────
if [ -f "$CREDS_FILE" ]; then
    AUTHED_ACCOUNT="$(python3 -c "import json; d=json.load(open('$CREDS_FILE')); print(d.get('client_id','') or d.get('service_account_email','unknown'))" 2>/dev/null || echo "unknown")"
    echo "✔ GCP credentials found (account: $AUTHED_ACCOUNT). Skipping login."
    echo "  To re-authenticate, delete $CREDS_FILE and re-run this script."
    echo ""
else
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║      First-time setup: GCP authentication required           ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Click the URL below, sign in, then paste the verification code here."
    echo ""

    gcloud auth application-default login --no-launch-browser

    if [ -n "${GOOGLE_CLOUD_PROJECT:-}" ]; then
        gcloud auth application-default set-quota-project "${GOOGLE_CLOUD_PROJECT}"
    fi

    echo ""
    echo "✔ Authentication complete."
    echo ""
fi

# ── 3. Start sibling services via host Docker socket ─────────────────────────
echo "Starting services..."
echo ""

# Pre-create the gcloud_config volume under the compose project name so compose
# recognises it as its own and doesn't warn about an externally-created volume.
docker volume create agent-platform_gcloud_config >/dev/null 2>&1 || true

# --project-directory must be the host-side path so Docker resolves bind-mount sources
# against the host filesystem, not the container path.
# COMPOSE_IGNORE_ORPHANS suppresses the workspace container orphan warning — the
# workspace service is intentionally absent from this up invocation.
COMPOSE_IGNORE_ORPHANS=1 docker compose \
    --project-directory "$HOST_PROJECT_ROOT" \
    -f "$PROJECT_ROOT/docker-compose.yml" \
    up -d --wait --wait-timeout 120 \
    postgres mcp-toolbox agent frontend

echo ""
echo "✔ All services running."
echo ""
echo "  Frontend  → http://localhost:3000"
echo "  ADK Agent → http://localhost:8000/dev-ui"
echo "  MCP UI    → http://localhost:5000/ui"
echo ""
echo "Optional MCP servers (not started by default):"
echo "  Google Ads  → docker compose --profile google-ads up -d mcp-google-ads"
echo "  Math        → docker compose --profile math up -d mcp-math"
echo ""
