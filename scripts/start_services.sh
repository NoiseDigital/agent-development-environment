#!/bin/bash
# Startup script for local dev services.
# 1. Checks for GCP credentials and prompts for login if missing.
# 2. Starts all app services via docker compose (idempotent — safe to re-run).
#    Retries on transient DNS/network failures with backoff.
# 3. Optionally tails combined service logs (when TAIL_LOGS=1).

set -euo pipefail

export LANG="${LANG:-C.UTF-8}"
export LANGUAGE="${LANGUAGE:-C.UTF-8}"
export LC_ALL="${LC_ALL:-C.UTF-8}"

CREDS_FILE="/root/.config/gcloud/application_default_credentials.json"
MAX_RETRIES="${START_SERVICES_MAX_RETRIES:-3}"
RETRY_DELAY="${START_SERVICES_RETRY_DELAY_SECONDS:-5}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROMPT_FOR_AUTH="${START_SERVICES_PROMPT_FOR_AUTH:-1}"
LOCK_FILE="/tmp/agent-platform-start-services.lock"
REQUIRED_SERVICES=(postgres mcp agent frontend)

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
    echo "Startup already in progress in another shell. Skipping duplicate run."
    exit 0
fi

is_transient_error() {
    grep -Eqi \
        "no such host|temporary failure in name resolution|i/o timeout|\
tls handshake timeout|connection reset by peer|context deadline exceeded" \
        <<< "$1"
}

all_required_services_running() {
    local running_services
    local service

    running_services="$(docker compose ps --services --status running 2>/dev/null || true)"

    for service in "${REQUIRED_SERVICES[@]}"; do
        if ! grep -qx "$service" <<< "$running_services"; then
            return 1
        fi
    done

    return 0
}

stop_existing_services() {
    docker compose down >/dev/null 2>&1 || true
}

print_auth_instructions() {
    echo "  gcloud auth application-default login"
    if [ -n "${GOOGLE_CLOUD_PROJECT:-}" ]; then
        echo "  gcloud auth application-default set-quota-project ${GOOGLE_CLOUD_PROJECT}"
    fi
}

preflight_ready_for_full_startup() {
    if [ -z "${GOOGLE_CLOUD_PROJECT:-}" ]; then
        echo "⚠ GOOGLE_CLOUD_PROJECT is not set."
        echo "  For a reproducible local setup, create .env once with: cp .env.example .env"
        echo "  Then review/update GOOGLE_CLOUD_PROJECT in .env."
        echo ""
        return 1
    fi

    if [ ! -f "$CREDS_FILE" ]; then
        echo "⚠ GCP application default credentials are missing."
        echo "  Authenticate in an interactive terminal with:"
        print_auth_instructions
        echo ""
        return 1
    fi

    return 0
}

cd "$PROJECT_ROOT"

if [ -f .env ]; then
    # Export .env variables so auth/setup and child processes see them.
    set -a
    # shellcheck disable=SC1091 # .env is project-local and may be created at runtime.
    . ./.env
    set +a
fi

if [ "${AGENT_PLATFORM_DEVCONTAINER:-0}" = "1" ]; then
    echo "Inside devcontainer — services are managed by scripts/devcontainer_start.sh."
    echo "Run the 'Start Services' task (Terminal → Run Task) to start or restart services."
    exit 0
fi

# ── GCP Authentication ────────────────────────────────────────────────────────
if [ ! -f "$CREDS_FILE" ]; then
    if [ "$PROMPT_FOR_AUTH" != "1" ]; then
        echo "⚠ GCP auth prompt is disabled for this run."
        echo "  To authenticate manually, run:"
        print_auth_instructions
        echo ""
    elif [[ -t 0 && -t 1 ]]; then
        echo ""
        echo "╔══════════════════════════════════════════════════════════════╗"
        echo "║         First-time setup: GCP authentication required        ║"
        echo "╚══════════════════════════════════════════════════════════════╝"
        echo ""
        echo "A browser window will open for you to log in to Google Cloud."
        echo "Credentials are stored under /root/.config/gcloud and reused on future starts."
        echo ""

        gcloud auth application-default login

        if [ -n "${GOOGLE_CLOUD_PROJECT:-}" ]; then
            gcloud auth application-default set-quota-project "${GOOGLE_CLOUD_PROJECT}"
        fi

        echo ""
        echo "✔ Authentication complete."
        echo ""
    else
        echo "⚠ Skipping interactive GCP login (no interactive TTY available)."
        echo "  To authenticate, run this in an interactive terminal:"
        print_auth_instructions
        echo ""
    fi
fi

# ── Start app services ────────────────────────────────────────────────────────
if [ ! -f .env ]; then
    echo "⚠ .env is missing. Using compose defaults and any exported shell variables."
    echo "  For a reproducible local setup, create it once with: cp .env.example .env"
    echo ""
fi

if ! preflight_ready_for_full_startup; then
    stop_existing_services
    echo "Skipping service startup until required local configuration is present."
    exit 0
fi

if all_required_services_running; then
    echo "Services are already running."
    exit 0
fi

echo "Starting services..."

OUTPUT=""
SUCCEEDED=0
attempt=1

while [ "$attempt" -le "$MAX_RETRIES" ]; do
    OUTPUT_FILE="$(mktemp)"

    if docker compose up -d --wait --wait-timeout 120 2>&1 | tee "$OUTPUT_FILE"; then
        OUTPUT="$(cat "$OUTPUT_FILE")"
        rm -f "$OUTPUT_FILE"
        SUCCEEDED=1
        break
    fi

    OUTPUT="$(cat "$OUTPUT_FILE")"
    rm -f "$OUTPUT_FILE"

    if grep -qi "x509: certificate signed by unknown authority" <<< "$OUTPUT"; then
        echo ""
        echo "✖ Registry TLS certificate is not trusted."
        echo "  Configure Docker daemon trust for your org CA or registry mirror, then retry:"
        echo "  bash ${SCRIPT_DIR}/start_services.sh"
        exit 1
    fi

    if ! is_transient_error "$OUTPUT"; then
        echo ""
        echo "✖ Service startup failed."
        exit 1
    fi

    if [ "$attempt" -lt "$MAX_RETRIES" ]; then
        echo "Transient network error on attempt $attempt/$MAX_RETRIES. Retrying in ${RETRY_DELAY}s..."
        sleep "$RETRY_DELAY"
    fi

    attempt=$((attempt + 1))
done

if [ "$SUCCEEDED" -ne 1 ]; then
    echo ""
    echo "✖ Service startup failed after $MAX_RETRIES attempt(s) due to network/DNS errors."
    echo "  Check host networking and Docker daemon DNS settings, then retry."
    exit 1
fi

echo ""
echo "✔ All services running."
echo ""

# ── Tail combined logs ────────────────────────────────────────────────────────
if [ "${TAIL_LOGS:-0}" = "1" ]; then
    echo "Tailing logs (Ctrl-C to detach):"
    echo ""
    docker compose logs -f
fi
