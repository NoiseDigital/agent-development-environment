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
# mints the ID token). The deeper services (agent/stats/toolbox) rely on the
# network boundary alone (allUsers invoker): this is a SINGLE-TENANT project, so
# the only thing inside the VPC that can reach them is this tenant's own
# services — internal ingress is a sound boundary here. (If a future shared
# project ever co-located tenants, tighten to per-SA IAM with ID tokens minted in
# the gateway/agent HTTP clients.)
#
# Images: seeded with a placeholder; CI rolls real revisions. `ignore_changes`
# on the image keeps `terraform apply` from reverting CI deploys.
# ─────────────────────────────────────────────────────────────────────────────

data "google_project" "this" {
  project_id = local.project_id
}

locals {
  db_secret = google_secret_manager_secret.database_url.secret_id

  # Deterministic Cloud Run v2 URLs. Used in env vars so services can address
  # each other WITHOUT a Terraform dependency cycle (agent↔mcp-stats reference
  # each other). This is the canonical v2 URL form and equals each service `.uri`.
  run_url = {
    for svc in ["gateway", "agents", "mcp-stats", "mcp-toolbox"] :
    svc => "https://${svc}-${data.google_project.this.number}.${var.region}.run.app"
  }
}

# ── Agent (private) ─────────────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "agent" {
  project             = local.project_id
  name                = "agents"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = local.is_protected

  template {
    service_account = google_service_account.agent.email
    vpc_access {
      # Direct VPC egress (no Serverless connector) — the GCP-recommended default:
      # simpler, cheaper, faster. ALL_TRAFFIC so calls to a sibling's *.run.app
      # route through the VPC and count as internal, and to reach the private
      # Cloud SQL IP.
      network_interfaces {
        network    = google_compute_network.vpc.name
        subnetwork = google_compute_subnetwork.subnet.name
      }
      egress = "ALL_TRAFFIC"
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
  depends_on = [google_project_service.services, google_secret_manager_secret_version.database_url]
}

# ── MCP stats (private) ─────────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "mcp_stats" {
  project             = local.project_id
  name                = "mcp-stats"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = local.is_protected

  template {
    service_account = google_service_account.mcp_stats.email
    vpc_access {
      # Direct VPC egress (no Serverless connector) — the GCP-recommended default:
      # simpler, cheaper, faster. ALL_TRAFFIC so calls to a sibling's *.run.app
      # route through the VPC and count as internal, and to reach the private
      # Cloud SQL IP.
      network_interfaces {
        network    = google_compute_network.vpc.name
        subnetwork = google_compute_subnetwork.subnet.name
      }
      egress = "ALL_TRAFFIC"
    }
    containers {
      image = var.placeholder_image
      ports { container_port = 8080 }
      env {
        name  = "AGENT_URL"
        value = local.run_url["agents"]
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
  depends_on = [google_project_service.services, google_secret_manager_secret_version.database_url]
}

# ── MCP toolbox (private) ───────────────────────────────────────────────────
# Image is built by CI from services/backend/mcp/images/toolbox/Dockerfile
# (the upstream toolbox image with tools.yaml baked in). Seeded with the
# placeholder; CI rolls the real image.
resource "google_cloud_run_v2_service" "mcp_toolbox" {
  project             = local.project_id
  name                = "mcp-toolbox"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = local.is_protected

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
  depends_on = [google_project_service.services, google_secret_manager_secret_version.database_url]
}

# ── Gateway (public entry point) ────────────────────────────────────────────
resource "google_cloud_run_v2_service" "gateway" {
  project  = local.project_id
  name     = "gateway"
  location = var.region
  # Internal ingress only — the browser never reaches the gateway. The Next.js
  # BFF (App Hosting, via Direct VPC egress) is the sole caller; auth is also
  # enforced in app. This is the BFF posture (no public gateway, no CORS).
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = local.is_protected

  template {
    service_account = google_service_account.gateway.email
    vpc_access {
      # Direct VPC egress (no Serverless connector) — the GCP-recommended default:
      # simpler, cheaper, faster. ALL_TRAFFIC so calls to a sibling's *.run.app
      # route through the VPC and count as internal, and to reach the private
      # Cloud SQL IP.
      network_interfaces {
        network    = google_compute_network.vpc.name
        subnetwork = google_compute_subnetwork.subnet.name
      }
      egress = "ALL_TRAFFIC"
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
        value = local.run_url["agents"]
      }
      env {
        name  = "STATS_URL"
        value = local.run_url["mcp-stats"]
      }
      # Access control: enforce the invite-only allowlist + DB-resolved roles in
      # prod (off in local dev, where every user is admin). Bootstrap admins
      # auto-provision on first sign-in so there's an admin to invite the rest.
      env {
        name  = "REQUIRE_PROVISIONED_USERS"
        value = "true"
      }
      env {
        name  = "BOOTSTRAP_ADMIN_EMAILS"
        value = join(",", var.admin_emails)
      }
      # No Firebase here (the BFF verifies identity and forwards X-User-*), and
      # no ALLOWED_ORIGINS / CORS — the only caller is the same-origin BFF.
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
  depends_on = [google_project_service.services, google_secret_manager_secret_version.database_url]
}

# ── migrate job — `alembic upgrade head`, run by CI before each deploy ───────
resource "google_cloud_run_v2_job" "migrate" {
  project             = local.project_id
  name                = "migrate"
  deletion_protection = local.is_protected
  location            = var.region

  template {
    template {
      service_account = google_service_account.gateway.email
      vpc_access {
        network_interfaces {
          network    = google_compute_network.vpc.name
          subnetwork = google_compute_subnetwork.subnet.name
        }
        egress = "ALL_TRAFFIC"
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
  depends_on = [google_project_service.services, google_secret_manager_secret_version.database_url]
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
