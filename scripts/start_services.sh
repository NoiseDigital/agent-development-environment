#!/bin/bash
# Startup script — runs inside the devcontainer on every attach.
# 1. Checks for GCP credentials and prompts for login if missing.
# 2. Starts all app services via docker compose (idempotent — safe to re-run).
#    Retries on transient DNS/network failures with backoff.
# 3. Tails combined service logs (when TAIL_LOGS=1).

set -euo pipefail

export LANG="${LANG:-C.UTF-8}"
export LANGUAGE="${LANGUAGE:-C.UTF-8}"
export LC_ALL="${LC_ALL:-C.UTF-8}"

CREDS_FILE="/root/.config/gcloud/application_default_credentials.json"
MAX_RETRIES="${START_SERVICES_MAX_RETRIES:-3}"
RETRY_DELAY="${START_SERVICES_RETRY_DELAY_SECONDS:-5}"

is_transient_error() {
    grep -Eqi \
        "no such host|temporary failure in name resolution|i/o timeout|\
tls handshake timeout|connection reset by peer|context deadline exceeded" \
        <<< "$1"
}

# ── GCP Authentication ────────────────────────────────────────────────────────
if [ ! -f "$CREDS_FILE" ]; then
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
fi

# ── Start app services ────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Starting services..."

OUTPUT=""
SUCCEEDED=0
attempt=1

while [ "$attempt" -le "$MAX_RETRIES" ]; do
    if OUTPUT="$(docker compose up -d --remove-orphans 2>&1)"; then
        SUCCEEDED=1
        break
    fi

    echo "$OUTPUT"

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
    echo "$OUTPUT"
    echo ""
    echo "✖ Service startup failed after $MAX_RETRIES attempt(s) due to network/DNS errors."
    echo "  Check host networking and Docker daemon DNS settings, then retry."
    exit 1
fi

echo "$OUTPUT"
echo ""
echo "✔ All services running."
echo ""

# ── Tail combined logs ────────────────────────────────────────────────────────
if [ "${TAIL_LOGS:-0}" = "1" ]; then
    echo "Tailing logs (Ctrl-C to detach):"
    echo ""
    docker compose logs -f
fi
