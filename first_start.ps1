# First-time setup script for Windows.
# Usage: .\first_start.ps1
#
# Checks for GCP credentials and runs `gcloud auth application-default login`
# interactively if missing, then starts all services via docker compose up.
# On subsequent runs, use `docker compose up` directly.

$ErrorActionPreference = "Stop"

# Build the devcontainer image up front — needed for both the creds check and auth.
docker-compose build --quiet devcontainer

# The devcontainer ENTRYPOINT is `bash`, so args are passed directly to bash.
# `docker-compose run devcontainer -c "..."` → `bash -c "..."`
function Test-CredsExist {
    docker-compose run --rm --no-deps -T `
        devcontainer `
        -c "test -f /root/.config/gcloud/application_default_credentials.json" `
        2>$null
    return $LASTEXITCODE -eq 0
}

if (-not (Test-CredsExist)) {
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════════════════════╗"
    Write-Host "║         First-time setup: GCP authentication required        ║"
    Write-Host "╚══════════════════════════════════════════════════════════════╝"
    Write-Host ""
    Write-Host "A browser window will open for you to log in to Google Cloud."
    Write-Host "Credentials are stored in a Docker volume and reused on future starts."
    Write-Host ""

    docker-compose build --quiet devcontainer
    docker-compose run --rm devcontainer -c "gcloud auth application-default login"

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Authentication failed. Please try again."
        exit 1
    }

    $project = $env:GOOGLE_CLOUD_PROJECT
    if ($project) {
        docker-compose run --rm --no-deps devcontainer `
            -c "gcloud auth application-default set-quota-project $project"
    }

    Write-Host ""
    Write-Host "✔ Authentication complete. Starting all services..."
    Write-Host ""
}

docker-compose up @args
