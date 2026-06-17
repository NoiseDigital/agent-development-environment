# ─────────────────────────────────────────────────────────────────────────────
# Server-side Google Tag Manager (sGTM).
#
# Google's official server image (gcr.io/cloud-tagging-10302018/gtm-cloud-image)
# on Cloud Run. The browser's gtag.js posts measurement data here
# (server_container_url) instead of straight to Google; the container's tags and
# triggers — authored in the GTM UI — shape it and route it onward to GA4.
#
# Gated on the container config: until a GTM *Server* container exists and its
# CONTAINER_CONFIG is supplied (var.sgtm_container_config, kept in Secret Manager,
# never in the repo), NOTHING here is created — a tenant without tagging deploys
# cleanly and the empty-config crash-loop never happens. Public ingress, because
# it's a browser-facing collection endpoint, in the tenant region so measurement
# data stays in-region.
#
# Image: like the other image-based services, seeded with the placeholder and
# rolled by CI (which builds services/backend/tagging/sgtm/Dockerfile — Google's
# gtm-cloud-image re-published into our Artifact Registry). `ignore_changes` on
# the image keeps `terraform apply` from reverting CI deploys.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  # `enabled` derives from the sensitive config var, so Terraform taints it (and
  # anything built from it) as sensitive. But whether tagging is configured — and
  # the resulting public run.app URL — are NOT secret. nonsensitive() strips the
  # taint from the boolean so `sgtm_url` stays a readable output (and `count`
  # doesn't carry a sensitive value). It leaks only "is sgtm on", never the config.
  sgtm_enabled = nonsensitive(trimspace(var.sgtm_container_config) != "")
  sgtm_count   = local.sgtm_enabled ? 1 : 0
  sgtm_url     = local.sgtm_enabled ? "https://sgtm-${data.google_project.this.number}.${var.region}.run.app" : ""
}

resource "google_service_account" "sgtm" {
  count        = local.sgtm_count
  project      = local.project_id
  account_id   = "sgtm-server"
  display_name = "Server-side GTM runtime (${local.name_prefix})"
}

resource "google_secret_manager_secret" "sgtm_container_config" {
  count     = local.sgtm_count
  project   = local.project_id
  secret_id = "sgtm-container-config"

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_version" "sgtm_container_config" {
  count       = local.sgtm_count
  secret      = google_secret_manager_secret.sgtm_container_config[0].id
  secret_data = var.sgtm_container_config
}

resource "google_secret_manager_secret_iam_member" "sgtm_config_accessor" {
  count     = local.sgtm_count
  project   = local.project_id
  secret_id = google_secret_manager_secret.sgtm_container_config[0].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.sgtm[0].email}"
}

resource "google_cloud_run_v2_service" "sgtm" {
  count               = local.sgtm_count
  project             = local.project_id
  name                = "sgtm"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = local.is_protected

  template {
    service_account = google_service_account.sgtm[0].email
    # sbx keeps min 0 to stay cheap. For a production tagging server, bump
    # min_instance_count to >= 1 — sGTM cold starts delay/drop measurement hits.
    scaling {
      min_instance_count = 0
    }
    containers {
      image = var.placeholder_image
      # Cloud Run sets PORT automatically from container_port (8080) and rejects
      # it as an explicit env — the gtm-cloud-image listens on $PORT.
      ports {
        container_port = 8080
      }
      env {
        name = "CONTAINER_CONFIG"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.sgtm_container_config[0].secret_id
            version = "latest"
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
  depends_on = [google_project_service.services, google_secret_manager_secret_version.sgtm_container_config]
}

# Browser-facing collection endpoint: anyone may POST measurement data.
resource "google_cloud_run_v2_service_iam_member" "sgtm_public" {
  count    = local.sgtm_count
  project  = local.project_id
  location = var.region
  name     = google_cloud_run_v2_service.sgtm[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "sgtm_url" {
  description = "Public sGTM collection URL (gtag.js server_container_url). Empty until tagging is configured."
  value       = local.sgtm_url
}
