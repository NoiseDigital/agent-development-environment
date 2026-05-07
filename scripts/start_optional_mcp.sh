#!/bin/bash
# Starts an optional MCP profile from the devcontainer.
# For google-ads, this script enforces Secret Manager access and syncs
# services/backend/mcp/images/google-ads/.env before starting the service.

set -euo pipefail

export LANG="${LANG:-C.UTF-8}"
export LANGUAGE="${LANGUAGE:-C.UTF-8}"
export LC_ALL="${LC_ALL:-C.UTF-8}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CREDS_FILE="/root/.config/gcloud/application_default_credentials.json"

usage() {
  echo "Usage: $0 <google-ads|math>"
}

if [ "${1:-}" = "" ]; then
  usage
  exit 1
fi

PROFILE="$1"
CONTAINER_ID="$(hostname)"
HOST_PROJECT_ROOT="$(docker inspect "$CONTAINER_ID" \
    --format '{{range .Mounts}}{{if eq .Destination "/workspaces/agent-platform"}}{{.Source}}{{end}}{{end}}' \
    2>/dev/null || true)"

if [ -z "$HOST_PROJECT_ROOT" ]; then
  HOST_PROJECT_ROOT="$PROJECT_ROOT"
fi

# Convert Windows-style paths (e.g. C:\Users\...) to /drive/path format so the
# Linux Docker CLI does not treat them as relative paths when passed to
# --project-directory (Docker Desktop on Windows returns Windows paths from inspect).
if [[ "$HOST_PROJECT_ROOT" =~ ^([A-Za-z]):[/\\](.*) ]]; then
    _drive="${BASH_REMATCH[1],,}"
    _rest="${BASH_REMATCH[2]//\\//}"
    HOST_PROJECT_ROOT="/${_drive}/${_rest}"
    unset _drive _rest
fi

cd "$PROJECT_ROOT"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

set -a
# shellcheck disable=SC1091 # .env is created from .env.example when missing.
. ./.env
set +a

GCLOUD_IMPERSONATION_ARGS=()
if [ -n "${GOOGLE_IMPERSONATE_SERVICE_ACCOUNT:-}" ]; then
  GCLOUD_IMPERSONATION_ARGS=(--impersonate-service-account "$GOOGLE_IMPERSONATE_SERVICE_ACCOUNT")
fi

if [ "$PROFILE" = "google-ads" ]; then
  if [ ! -f "$CREDS_FILE" ]; then
    echo "No ADC credentials found at $CREDS_FILE"
    echo "Run: gcloud auth application-default login --no-launch-browser"
    exit 1
  fi

  if [ -z "${GOOGLE_ADS_MCP_ENV_SECRET_NAME:-}" ]; then
    echo "GOOGLE_ADS_MCP_ENV_SECRET_NAME is not set in .env"
    echo "Cannot start mcp-google-ads without secret-backed env."
    exit 1
  fi

  GOOGLE_ADS_SECRET_PROJECT="${GOOGLE_ADS_MCP_ENV_SECRET_PROJECT:-${GOOGLE_CLOUD_PROJECT:-}}"
  GOOGLE_ADS_SECRET_VERSION="${GOOGLE_ADS_MCP_ENV_SECRET_VERSION:-latest}"
  GOOGLE_ADS_ENV_PATH="$PROJECT_ROOT/services/backend/mcp/images/google-ads/.env"

  if [ -z "$GOOGLE_ADS_SECRET_PROJECT" ]; then
    echo "GOOGLE_ADS_MCP_ENV_SECRET_PROJECT and GOOGLE_CLOUD_PROJECT are both unset."
    exit 1
  fi

  # If impersonation is configured, verify token minting first so failures are obvious.
  if [ -n "${GOOGLE_IMPERSONATE_SERVICE_ACCOUNT:-}" ]; then
    if ! gcloud "${GCLOUD_IMPERSONATION_ARGS[@]}" auth print-access-token >/dev/null 2>/tmp/mcp_google_ads_impersonation.err; then
      echo "Failed to impersonate service account '$GOOGLE_IMPERSONATE_SERVICE_ACCOUNT'."
      echo "Required IAM permission: iam.serviceAccounts.getAccessToken"
      echo "(typically granted via roles/iam.serviceAccountTokenCreator)."
      echo "gcloud error:"
      tail -n 3 /tmp/mcp_google_ads_impersonation.err || true
      rm -f /tmp/mcp_google_ads_impersonation.err
      exit 1
    fi
    rm -f /tmp/mcp_google_ads_impersonation.err
  fi

  if ! gcloud "${GCLOUD_IMPERSONATION_ARGS[@]}" secrets versions access "$GOOGLE_ADS_SECRET_VERSION" \
      --secret "$GOOGLE_ADS_MCP_ENV_SECRET_NAME" \
      --project "$GOOGLE_ADS_SECRET_PROJECT" \
      > "$GOOGLE_ADS_ENV_PATH" 2>/tmp/mcp_google_ads_secret_access.err; then
    rm -f "$GOOGLE_ADS_ENV_PATH"
    echo "Failed to access secret '$GOOGLE_ADS_MCP_ENV_SECRET_NAME'"
    echo "in project '$GOOGLE_ADS_SECRET_PROJECT' (version: $GOOGLE_ADS_SECRET_VERSION)."
    echo "Required IAM permission: secretmanager.versions.access"
    echo "(typically granted via roles/secretmanager.secretAccessor)."
    echo "gcloud error:"
    tail -n 3 /tmp/mcp_google_ads_secret_access.err || true
    rm -f /tmp/mcp_google_ads_secret_access.err
    echo "mcp-google-ads was not started."
    exit 1
  fi
  rm -f /tmp/mcp_google_ads_secret_access.err

  chmod 600 "$GOOGLE_ADS_ENV_PATH"

  docker compose \
      --project-directory "$PROJECT_ROOT" \
      -f "$PROJECT_ROOT/docker-compose.yml" \
      --profile google-ads build mcp-google-ads

  COMPOSE_IGNORE_ORPHANS=1 docker compose \
      --project-directory "$HOST_PROJECT_ROOT" \
      -f "$PROJECT_ROOT/docker-compose.yml" \
      --profile google-ads up -d --no-build mcp-google-ads

  echo "mcp-google-ads started at http://localhost:${GOOGLE_ADS_MCP_PORT:-5001}/mcp"
  exit 0
fi

if [ "$PROFILE" = "math" ]; then
  docker compose \
      --project-directory "$PROJECT_ROOT" \
      -f "$PROJECT_ROOT/docker-compose.yml" \
      --profile math build mcp-math

  COMPOSE_IGNORE_ORPHANS=1 docker compose \
      --project-directory "$HOST_PROJECT_ROOT" \
      -f "$PROJECT_ROOT/docker-compose.yml" \
      --profile math up -d --no-build mcp-math

  echo "mcp-math started at http://localhost:${MATH_MCP_PORT:-5002}/mcp"
  exit 0
fi

usage
exit 1
