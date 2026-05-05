#!/bin/bash
# First-time setup script for the local development environment.
# Usage: ./first_start.sh
#
# Checks for GCP credentials and runs `gcloud auth application-default login`
# interactively if missing, then starts all services via docker compose up.
# On subsequent runs, use `docker compose up` directly.

set -e

# Build the devcontainer image up front — needed for both the creds check and auth.
docker-compose build --quiet devcontainer

# The devcontainer ENTRYPOINT is `bash`, so arguments are passed directly to bash.
# `docker-compose run devcontainer -c "..."` → `bash -c "..."`
creds_exist() {
    docker-compose run --rm --no-deps -T \
        devcontainer \
        -c "test -f /root/.config/gcloud/application_default_credentials.json" \
        >/dev/null 2>&1
}

if ! creds_exist; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║         First-time setup: GCP authentication required        ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo "A browser window will open for you to log in to Google Cloud."
    echo "Credentials are stored in a Docker volume and reused on future starts."
    echo ""

    docker-compose run --rm devcontainer \
        -c "gcloud auth application-default login"

    # Set quota project to avoid "quota exceeded" warnings
    if [ -n "${GOOGLE_CLOUD_PROJECT}" ]; then
        docker-compose run --rm --no-deps devcontainer \
            -c "gcloud auth application-default set-quota-project ${GOOGLE_CLOUD_PROJECT}"
    fi

    echo ""
    echo "✔ Authentication complete. Starting all services..."
    echo ""
fi

docker-compose up "$@"

