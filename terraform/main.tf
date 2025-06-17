provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = "fastapi-repo"
  format        = "DOCKER"
  description   = "Docker repository for FastAPI Cloud Run App Images"
}

# The image_url variable should reference the repo dynamically for automation
locals {
  image_url = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}/agent-engine-service:latest"
}

resource "google_cloud_run_service" "agent_engine_service" {
  name     = "agent-engine-service"
  location = var.region

  template {
    spec {
      containers {
        image = local.image_url
        ports {
          container_port = 8080
        }
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }
}

resource "google_cloud_run_service_iam_member" "public" {
  location = google_cloud_run_service.agent_engine_service.location
  service  = google_cloud_run_service.agent_engine_service.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}