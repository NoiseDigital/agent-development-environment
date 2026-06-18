# ─────────────────────────────────────────────────────────────────────────────
# Cloud Run services + the migrate job.
#
# Topology:
#   frontend BFF ─▶ gateway (INTERNAL ingress, invoker = frontend SA)
#                     ├─▶ agents     (INTERNAL ingress, invoker = gateway SA)
#                     ├─▶ mcp-stats  (INTERNAL ingress, invoker = gateway SA)
#                     └─▶ mcp-toolbox(INTERNAL ingress, invoker = gateway SA)
#   agents ─▶ mcp-toolbox / mcp-stats (INTERNAL, invoker = agent SA)
#
# Nothing here is public except the frontend — every backend is internal-ingress
# (off the internet). Internal ingress is necessary but NOT sufficient: Cloud Run
# rejects an unauthenticated VPC-routed call (403), so EVERY hop authenticates
# with a Google-signed ID token (audience = the target's custom audience) and the
# caller SA holds run.invoker on the target. See the internal_invokers grants and
# the _idtoken helpers in each service. Network boundary is defence-in-depth.
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

  # Callers (the gateway) authenticate with an ID token whose audience is this
  # service's deterministic URL — an alias, not the primary .uri, so it must be
  # registered as a custom audience for Cloud Run to accept it.
  custom_audiences = [local.run_url["agents"]]

  template {
    service_account = google_service_account.agent.email
    vpc_access {
      # Direct VPC egress (no Serverless connector) — the GCP-recommended default:
      # simpler, cheaper, faster. ALL_TRAFFIC so calls to a sibling's *.run.app
      # reach its internal ingress (the caller still sends an ID token — see the
      # internal_invokers grants), and to reach the private Cloud SQL IP.
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

  # Callers (gateway, agent) authenticate with an ID token whose audience is this
  # service's deterministic URL — an alias, not the primary .uri, so it must be
  # registered as a custom audience for Cloud Run to accept it.
  custom_audiences = [local.run_url["mcp-stats"]]

  template {
    service_account = google_service_account.mcp_stats.email
    vpc_access {
      # Direct VPC egress (no Serverless connector) — the GCP-recommended default:
      # simpler, cheaper, faster. ALL_TRAFFIC so calls to a sibling's *.run.app
      # reach its internal ingress (the caller still sends an ID token — see the
      # internal_invokers grants), and to reach the private Cloud SQL IP.
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

  # Callers (gateway, agent) authenticate with an ID token whose audience is this
  # service's deterministic URL — an alias, not the primary .uri, so it must be
  # registered as a custom audience for Cloud Run to accept it.
  custom_audiences = [local.run_url["mcp-toolbox"]]

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

  # The BFF authenticates with an ID token whose audience is the gateway's
  # deterministic URL (stable + constructible per tenant — see run_url). That URL
  # is an alias, not the service's primary .uri, so Cloud Run won't accept it as
  # an audience by default. Register it explicitly as a custom audience.
  custom_audiences = [local.run_url["gateway"]]

  template {
    service_account = google_service_account.gateway.email
    vpc_access {
      # Direct VPC egress (no Serverless connector) — the GCP-recommended default:
      # simpler, cheaper, faster. ALL_TRAFFIC so calls to a sibling's *.run.app
      # reach its internal ingress (the caller still sends an ID token — see the
      # internal_invokers grants), and to reach the private Cloud SQL IP.
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
      # The gateway is the dashboards BFF — it queries the Toolbox for tile data
      # (api/toolbox.py). Without this it falls back to the local-compose
      # hostname and can't resolve it on Cloud Run.
      env {
        name  = "TOOLBOX_ENDPOINT"
        value = local.run_url["mcp-toolbox"]
      }
      # Access control is enforced by default (the gateway only relaxes when
      # GATEWAY_DEV_AUTH is set, which Cloud Run never does). Bootstrap admins
      # auto-provision on first sign-in so there's an admin to invite the rest.
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
        command = ["uv", "run", "--no-sync", "alembic", "upgrade", "head"]
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

# ── Frontend (the Next.js app + BFF) ────────────────────────────────────────
# Public ingress (user-facing). Direct VPC egress so its /gw proxy can reach the
# INTERNAL-ingress gateway. Image seeded with a placeholder; CI rolls the real
# build (NEXT_PUBLIC_* baked at build time — see deploy.yml + the Dockerfile).
resource "google_cloud_run_v2_service" "frontend" {
  project             = local.project_id
  name                = "frontend"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = local.is_protected

  template {
    service_account = google_service_account.frontend.email
    vpc_access {
      network_interfaces {
        network    = google_compute_network.vpc.name
        subnetwork = google_compute_subnetwork.subnet.name
      }
      egress = "ALL_TRAFFIC"
    }
    containers {
      image = var.placeholder_image
      ports { container_port = 8080 }

      # Server-only: the /gw proxy's target + the audience for the Cloud Run IAM
      # ID token it mints (the gateway's deterministic URL = its custom audience).
      env {
        name  = "GATEWAY_URL"
        value = local.run_url["gateway"]
      }
      env {
        name  = "GATEWAY_AUDIENCE"
        value = local.run_url["gateway"]
      }
      # Firebase project for the Admin SDK (session cookies) + the client SDK
      # (the public NEXT_PUBLIC_* are also baked at build; set here for server use).
      env {
        name  = "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
        value = local.project_id
      }
      env {
        name  = "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
        value = "${local.project_id}.firebaseapp.com"
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
  depends_on = [google_project_service.services]
}

# Public: anyone can load the app (auth happens in-app via Firebase + the gateway).
resource "google_cloud_run_v2_service_iam_member" "frontend_public" {
  project  = local.project_id
  location = var.region
  name     = google_cloud_run_v2_service.frontend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ── Invoker boundary: who may call each service ─────────────────────────────
# Gateway is internal-ingress; the frontend (BFF) is the ONLY caller, via an ID
# token minted as the frontend SA. The browser never reaches it directly.
resource "google_cloud_run_v2_service_iam_member" "gateway_from_bff" {
  project  = local.project_id
  location = var.region
  name     = google_cloud_run_v2_service.gateway.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.frontend.email}"
}

# Deep internal services (agents / mcp-stats / mcp-toolbox): internal ingress is
# necessary but NOT sufficient — Cloud Run still rejects an unauthenticated
# VPC-routed call (403). Each caller mints an ID token (audience = the target's
# custom audience) AND must hold run.invoker on the target. One grant per
# caller→target edge; the network boundary is defence-in-depth on top.
resource "google_cloud_run_v2_service_iam_member" "internal_invokers" {
  for_each = {
    # the gateway proxies browser traffic to the agent + stats, and renders
    # dashboard tiles via the toolbox.
    agents_from_gateway  = { service = google_cloud_run_v2_service.agent.name, caller = google_service_account.gateway.email }
    stats_from_gateway   = { service = google_cloud_run_v2_service.mcp_stats.name, caller = google_service_account.gateway.email }
    toolbox_from_gateway = { service = google_cloud_run_v2_service.mcp_toolbox.name, caller = google_service_account.gateway.email }
    # the agent loads Toolbox toolsets and (media agent) the stats MCP directly.
    toolbox_from_agent = { service = google_cloud_run_v2_service.mcp_toolbox.name, caller = google_service_account.agent.email }
    stats_from_agent   = { service = google_cloud_run_v2_service.mcp_stats.name, caller = google_service_account.agent.email }
    # mcp-stats calls back to the agent to resolve an upload's storage key
    # (services/backend/mcp/stats/resolve.py).
    agents_from_stats = { service = google_cloud_run_v2_service.agent.name, caller = google_service_account.mcp_stats.email }
  }
  project  = local.project_id
  location = var.region
  name     = each.value.service
  role     = "roles/run.invoker"
  member   = "serviceAccount:${each.value.caller}"
}
