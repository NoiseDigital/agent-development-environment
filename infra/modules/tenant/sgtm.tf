# ─────────────────────────────────────────────────────────────────────────────
# Server-side Google Tag Manager (sGTM).
#
# Google's official server image (gcr.io/cloud-tagging-10302018/gtm-cloud-image)
# on Cloud Run. The browser's gtag.js posts measurement data here
# (server_container_url) instead of straight to Google; the container's tags and
# triggers — authored in the GTM UI — shape it and route it onward to GA4.
#
# Gated on a COMMITTED toggle (var.enable_sgtm) — NOT on the secret value — so a
# routine `terraform apply` can never tear the service down for lack of a TF_VAR.
# The CONTAINER_CONFIG value lives ONLY in Secret Manager: Terraform seeds a
# placeholder secret version so the service can deploy, and the real value is
# added out-of-band (`gcloud secrets versions add`), which becomes `latest`. It
# never passes through Terraform, tfvars, or state. See
# services/backend/tagging/sgtm/README.md. Public ingress (browser-facing
# collection endpoint), in the tenant region so measurement data stays in-region.
#
# Image: like the other image-based services, seeded with the placeholder and
# rolled by CI (which builds services/backend/tagging/sgtm/Dockerfile — Google's
# gtm-cloud-image re-published into our Artifact Registry). `ignore_changes` on
# the image keeps `terraform apply` from reverting CI deploys.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  # Existence keys off a committed, non-secret toggle — never the secret value —
  # so an apply for an unrelated change can't destroy sGTM by omitting a TF_VAR.
  sgtm_enabled = var.enable_sgtm
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

# Bootstrap version only — a Cloud Run secret env ref needs SOME version to exist
# before the service can deploy. The REAL CONTAINER_CONFIG is added out-of-band
# (`gcloud secrets versions add sgtm-container-config …`) and becomes `latest`,
# which the service reads. ignore_changes keeps Terraform from clobbering that
# real version, so the secret value is never in TF / tfvars / state — only in
# Secret Manager. See services/backend/tagging/sgtm/README.md.
resource "google_secret_manager_secret_version" "sgtm_container_config" {
  count       = local.sgtm_count
  secret      = google_secret_manager_secret.sgtm_container_config[0].id
  secret_data = "REPLACE_VIA_GCLOUD"

  lifecycle {
    ignore_changes = [secret_data, enabled]
  }
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
