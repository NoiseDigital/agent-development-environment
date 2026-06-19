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

normalize_host_path() {
    local host_path="$1"

    # Windows drive letter path (e.g. C:\Users\...)
    if [[ "$host_path" =~ ^([A-Za-z]):[/\\](.*) ]]; then
        local drive="${BASH_REMATCH[1],,}"
        local rest="${BASH_REMATCH[2]//\\//}"
        echo "/${drive}/${rest}"
        return
    fi

    # Windows UNC WSL path (e.g. \\wsl.localhost\Ubuntu\home\user\repo)
    if [[ "$host_path" =~ ^\\\\wsl\.localhost\\([^\\]+)\\(.*) ]]; then
        local distro="${BASH_REMATCH[1]}"
        local rest="${BASH_REMATCH[2]//\\//}"
        echo "/run/desktop/mnt/host/wsl/${distro}/${rest}"
        return
    fi

    # Slash-style WSL UNC path (e.g. //wsl.localhost/Ubuntu/home/user/repo)
    if [[ "$host_path" =~ ^//wsl\.localhost/([^/]+)/(.*) ]]; then
        local distro="${BASH_REMATCH[1]}"
        local rest="${BASH_REMATCH[2]}"
        echo "/run/desktop/mnt/host/wsl/${distro}/${rest}"
        return
    fi

    echo "$host_path"
}

if [ -z "$HOST_PROJECT_ROOT" ]; then
    echo "⚠ Could not detect host project path from container mounts."
    echo "  Falling back to container path — bind mounts may not resolve correctly."
    HOST_PROJECT_ROOT="$PROJECT_ROOT"
fi

HOST_PROJECT_ROOT="$(normalize_host_path "$HOST_PROJECT_ROOT")"

echo "Resolved compose build root: $PROJECT_ROOT"
echo "Resolved compose host root:  $HOST_PROJECT_ROOT"

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
for mcp_dir in "$PROJECT_ROOT"/services/backend/mcp/images/*/; do
    mcp_name="$(basename "$mcp_dir")"
    if [ "$mcp_name" = "google-ads" ]; then
        continue
    fi
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

GCLOUD_IMPERSONATION_ARGS=()
if [ -n "${GOOGLE_IMPERSONATE_SERVICE_ACCOUNT:-}" ]; then
    GCLOUD_IMPERSONATION_ARGS=(--impersonate-service-account "$GOOGLE_IMPERSONATE_SERVICE_ACCOUNT")
fi

# Server-side GTM (sGTM) is profile-gated (`tagging`) — bring it up only when a
# container config is present, otherwise the gtm-cloud-image crash-loops on an
# empty CONTAINER_CONFIG. Naming the service explicitly on build/up starts it
# without needing --profile.
TAGGING_SERVICES=()
if [ -n "${SGTM_CONTAINER_CONFIG:-}" ]; then
    TAGGING_SERVICES=(sgtm)
    echo "  sGTM config detected — starting the tagging server (sgtm)."
fi

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

    gcloud auth application-default login --no-launch-browser "${GCLOUD_IMPERSONATION_ARGS[@]}"

    if [ -n "${GOOGLE_CLOUD_PROJECT:-}" ]; then
        gcloud auth application-default set-quota-project "${GOOGLE_CLOUD_PROJECT}"
    fi

    echo ""
    echo "✔ Authentication complete."
    echo ""
fi

# Sync secrets-backed env for Google Ads MCP.
GOOGLE_ADS_ENV_PATH="$PROJECT_ROOT/services/backend/mcp/images/google-ads/.env"
if [ -n "${GOOGLE_ADS_MCP_ENV_SECRET_NAME:-}" ]; then
    GOOGLE_ADS_SECRET_PROJECT="${GOOGLE_ADS_MCP_ENV_SECRET_PROJECT:-${GOOGLE_CLOUD_PROJECT:-}}"
    GOOGLE_ADS_SECRET_VERSION="${GOOGLE_ADS_MCP_ENV_SECRET_VERSION:-latest}"

    if [ -z "$GOOGLE_ADS_SECRET_PROJECT" ]; then
        echo "⚠ GOOGLE_ADS_MCP_ENV_SECRET_PROJECT and GOOGLE_CLOUD_PROJECT are both unset."
        echo "  Cannot fetch Google Ads MCP secret; profile will remain unavailable."
        rm -f "$GOOGLE_ADS_ENV_PATH"
    elif gcloud "${GCLOUD_IMPERSONATION_ARGS[@]}" secrets versions access "$GOOGLE_ADS_SECRET_VERSION" \
        --secret "$GOOGLE_ADS_MCP_ENV_SECRET_NAME" \
        --project "$GOOGLE_ADS_SECRET_PROJECT" \
        > "$GOOGLE_ADS_ENV_PATH" 2>/dev/null; then
        chmod 600 "$GOOGLE_ADS_ENV_PATH"
        echo "✔ Synced Google Ads MCP env from Secret Manager."
    else
        echo "⚠ Could not access secret '$GOOGLE_ADS_MCP_ENV_SECRET_NAME'"
        echo "  in project '$GOOGLE_ADS_SECRET_PROJECT' (version: $GOOGLE_ADS_SECRET_VERSION)."
        echo "  Google Ads MCP profile will not start without secret access."
        rm -f "$GOOGLE_ADS_ENV_PATH"
    fi
else
    rm -f "$GOOGLE_ADS_ENV_PATH"
fi

# ── 3. Start sibling services via host Docker socket ─────────────────────────
echo "Starting services..."
echo ""

# Pre-create the gcloud_config volume under the compose project name so compose
# recognises it as its own and doesn't warn about an externally-created volume.
docker volume create agent-platform_gcloud_config >/dev/null 2>&1 || true

# Build contexts must be resolved by the Docker CLI against the container filesystem.
# Bind-mount sources must be resolved by the Docker daemon against the host filesystem.
# Split into two steps: build first (container path), then start (host path, --no-build).
# COMPOSE_IGNORE_ORPHANS suppresses the workspace container orphan warning — the
# workspace service is intentionally absent from this up invocation.
#
docker compose \
    --project-directory "$PROJECT_ROOT" \
    -f "$PROJECT_ROOT/docker-compose.yml" \
    build gateway agents frontend mcp-stats migrate firebase-emulator "${TAGGING_SERVICES[@]}"

# Up ordering:
#   postgres (healthcheck) → migrate (one-shot `alembic upgrade head`, runs to
#   completion) → gateway + agents (both wait on migrate via
#   service_completed_successfully) → mcp-stats / frontend. firebase-emulator
#   starts alongside for local Firebase Auth. `--wait` blocks until every
#   long-running service is healthy (the one-shot migrate just needs exit 0).
COMPOSE_IGNORE_ORPHANS=1 docker compose \
    --project-directory "$HOST_PROJECT_ROOT" \
    -f "$PROJECT_ROOT/docker-compose.yml" \
    up -d --no-build --wait --wait-timeout 180 \
    postgres mcp-toolbox migrate firebase-emulator gateway agents frontend mcp-stats "${TAGGING_SERVICES[@]}"

# Reconcile each Python service's /opt/venv with its (bind-mounted) uv.lock.
# `uv run` only syncs at container *start*, and `up` won't recreate an already-
# running container — so a dependency bump applied while the stack is up would
# otherwise leave a stale venv (missing/old packages). This is dev-only: Cloud
# Run images bake deps at build time and run `uv run --no-sync` (no VPC egress).
echo "Syncing Python service environments to uv.lock…"
for svc in gateway agents mcp-stats; do
    if docker compose --project-directory "$HOST_PROJECT_ROOT" \
        -f "$PROJECT_ROOT/docker-compose.yml" \
        exec -T "$svc" uv sync --frozen >/dev/null 2>&1; then
        echo "  $svc ✓"
    else
        echo "  $svc — sync skipped (container not running?)"
    fi
done

# Reconcile the frontend's node_modules volume with package-lock.json. The volume
# (frontend_node_modules) masks the image's node_modules so source can be bind-
# mounted without the host's platform-wrong native modules leaking in — but it
# persists across image rebuilds, so a dependency bump leaves it stale (the same
# trap that bites the Python venvs above). npm ci is a full clean install, not a
# cheap no-op, so gate it on a hash of the lockfile: instant when unchanged,
# reinstall only when the lock actually moved.
echo "Reconciling frontend node_modules to package-lock.json…"
if docker compose --project-directory "$HOST_PROJECT_ROOT" \
    -f "$PROJECT_ROOT/docker-compose.yml" \
    exec -T frontend sh -c '
        want=$(sha256sum package-lock.json | cut -d" " -f1)
        have=$(cat node_modules/.deps-hash 2>/dev/null || echo none)
        if [ "$want" = "$have" ]; then
            echo "  frontend ✓ (up to date)"
        else
            echo "  frontend — lockfile changed, running npm ci…"
            npm ci --no-audit --no-fund && printf "%s" "$want" > node_modules/.deps-hash
        fi
    '; then
    :
else
    echo "  frontend — reconcile skipped (container not running?)"
fi

echo ""
echo "✔ All services running."
echo ""
echo "  Frontend  → http://localhost:3000"
echo "  ADK Agent → http://localhost:8000/dev-ui"
echo "  MCP UI    → http://localhost:5000/ui"
echo ""
echo "Optional MCP servers (not started by default):"
echo "  Google Ads  → ./scripts/start_optional_mcp.sh google-ads"
echo "  Math        → ./scripts/start_optional_mcp.sh math"
echo "  Asana       → ./scripts/start_optional_mcp.sh asana"
echo ""
