# ─────────────────────────────────────────────────────────────────────────────
# Cloud Run services + the migrate job.
#
# Topology:
#   App Hosting BFF ─▶ gateway (INTERNAL ingress, invoker = App Hosting SA)
#                        ├─▶ agent      (INTERNAL ingress)
#                        └─▶ mcp-stats  (INTERNAL ingress)
#   agent ─▶ mcp-toolbox / mcp-stats (INTERNAL)
#
# Nothing here is public — every service is internal-ingress (off the internet).
# The gateway additionally requires IAM (only the BFF SA can invoke it; the BFF
# mints the ID token). The deeper services (agent/stats/toolbox) use the network
# boundary alone (allUsers invoker) so the existing service-to-service calls work
# without threading ID tokens through every client. Hardening those to full IAM
# is a follow-up (would add ID-token minting to the gateway/agent HTTP clients).
#
# Images: seeded with a placeholder; CI rolls real revisions. `ignore_changes`
# on the image keeps `terraform apply` from reverting CI deploys.
# ─────────────────────────────────────────────────────────────────────────────

data "google_project" "this" {
  project_id = local.project_id
}

locals {
  vpc_access = {
    connector = google_vpc_access_connector.connector.id
    # ALL_TRAFFIC (not PRIVATE_RANGES_ONLY): calls to a sibling's *.run.app go to
    # a public IP, so they must route through the connector to be recognised as
    # internal — otherwise internal-ingress blocks them. Also covers the private
    # Cloud SQL IP.
    egress = "ALL_TRAFFIC"
  }
  db_secret = google_secret_manager_secret.database_url.secret_id

  # Deterministic Cloud Run v2 URLs. Used in env vars so services can address
  # each other WITHOUT a Terraform dependency cycle (agent↔mcp-stats reference
  # each other). This is the canonical v2 URL form and equals each service `.uri`.
  run_url = {
    for svc in ["gateway", "agent", "mcp-stats", "mcp-toolbox"] :
    svc => "https://${var.stage}-${svc}-${data.google_project.this.number}.${var.region}.run.app"
  }
}

# ── Agent (private) ─────────────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "agent" {
  project  = local.project_id
  name     = "${var.stage}-agent"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.agent.email
    vpc_access {
      connector = local.vpc_access.connector
      egress    = local.vpc_access.egress
    }
    containers {
      image = var.placeholder_image
      ports { container_port = 8000 }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = local.db_secret
            version = "latest"
          }
        }
      }
      env {
        name  = "GOOGLE_GENAI_USE_VERTEXAI"
        value = "true"
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = local.project_id
      }
      env {
        name  = "GOOGLE_CLOUD_LOCATION"
        value = var.vertex_location
      }
      env {
        name  = "STORAGE_BACKEND"
        value = "gcs"
      }
      env {
        name  = "GCS_BUCKET"
        value = google_storage_bucket.uploads.name
      }
      # Internal service URLs the agent calls (mirrors compose).
      env {
        name  = "TOOLBOX_ENDPOINT"
        value = local.run_url["mcp-toolbox"]
      }
      env {
        name  = "MCP_STATS_URL"
        value = "${local.run_url["mcp-stats"]}/sse"
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
  depends_on = [google_project_service.services]
}

# ── MCP stats (private) ─────────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "mcp_stats" {
  project  = local.project_id
  name     = "${var.stage}-mcp-stats"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.mcp_stats.email
    vpc_access {
      connector = local.vpc_access.connector
      egress    = local.vpc_access.egress
    }
    containers {
      image = var.placeholder_image
      ports { container_port = 8080 }
      env {
        name  = "AGENT_URL"
        value = local.run_url["agent"]
      }
      env {
        name  = "STORAGE_BACKEND"
        value = "gcs"
      }
      env {
        name  = "GCS_BUCKET"
        value = google_storage_bucket.uploads.name
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
  depends_on = [google_project_service.services]
}

# ── MCP toolbox (private) ───────────────────────────────────────────────────
# Image is built by CI from services/backend/mcp/images/toolbox/Dockerfile
# (the upstream toolbox image with tools.yaml baked in). Seeded with the
# placeholder; CI rolls the real image.
resource "google_cloud_run_v2_service" "mcp_toolbox" {
  project  = local.project_id
  name     = "${var.stage}-mcp-toolbox"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.toolbox.email
    containers {
      image = var.placeholder_image
      ports { container_port = 8080 }
      # tools.yaml is baked at project nd-agentspace-sbx; this gives the ADC
      # quota project and keeps the runtime consistent with that.
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = local.project_id
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
  depends_on = [google_project_service.services]
}

# ── Gateway (public entry point) ────────────────────────────────────────────
resource "google_cloud_run_v2_service" "gateway" {
  project  = local.project_id
  name     = "${var.stage}-gateway"
  location = var.region
  # Internal ingress only — the browser never reaches the gateway. The Next.js
  # BFF (App Hosting, over its VPC connector) is the sole caller; auth is also
  # enforced in app. This is the BFF posture (no public gateway, no CORS).
  ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.gateway.email
    vpc_access {
      connector = local.vpc_access.connector
      egress    = local.vpc_access.egress
    }
    containers {
      image = var.placeholder_image
      ports { container_port = 8080 }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = local.db_secret
            version = "latest"
          }
        }
      }
      env {
        name  = "AGENT_URL"
        value = local.run_url["agent"]
      }
      env {
        name  = "STATS_URL"
        value = local.run_url["mcp-stats"]
      }
      # No Firebase here (the BFF verifies identity and forwards X-User-*), and
      # no ALLOWED_ORIGINS / CORS — the only caller is the same-origin BFF.
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
  depends_on = [google_project_service.services]
}

# ── migrate job — `alembic upgrade head`, run by CI before each deploy ───────
resource "google_cloud_run_v2_job" "migrate" {
  project  = local.project_id
  name     = "${var.stage}-migrate"
  location = var.region

  template {
    template {
      service_account = google_service_account.gateway.email
      vpc_access {
        connector = local.vpc_access.connector
        egress    = local.vpc_access.egress
      }
      containers {
        image   = var.placeholder_image
        command = ["uv", "run", "alembic", "upgrade", "head"]
        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = local.db_secret
              version = "latest"
            }
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image, client, client_version]
  }
  depends_on = [google_project_service.services]
}

# ── Invoker boundary: who may call each service ─────────────────────────────
# Gateway is internal-ingress; the Next.js BFF (App Hosting SA) is the ONLY
# caller. The browser never reaches it directly.
resource "google_cloud_run_v2_service_iam_member" "gateway_from_bff" {
  project  = local.project_id
  location = var.region
  name     = google_cloud_run_v2_service.gateway.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.app_hosting.email}"
}

# Deep internal services (agent / mcp-stats / mcp-toolbox): reachable only from
# within the VPC (internal ingress), so the network is the boundary and the
# invoker is allUsers — no ID tokens needed on the existing service-to-service
# HTTP calls. Tighten to per-SA IAM once those clients mint ID tokens.
resource "google_cloud_run_v2_service_iam_member" "internal_invokers" {
  for_each = toset([
    google_cloud_run_v2_service.agent.name,
    google_cloud_run_v2_service.mcp_stats.name,
    google_cloud_run_v2_service.mcp_toolbox.name,
  ])
  project  = local.project_id
  location = var.region
  name     = each.value
  role     = "roles/run.invoker"
  member   = "allUsers"
}
