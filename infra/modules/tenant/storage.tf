# ─────────────────────────────────────────────────────────────────────────────
# GCS bucket for uploaded data sources (the prod backend for STORAGE_BACKEND=gcs;
# local volume in dev). The agent writes uploads; mcp-stats reads them.
# ─────────────────────────────────────────────────────────────────────────────

resource "google_storage_bucket" "uploads" {
  name                        = local.gcs_bucket
  project                     = local.project_id
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = !local.is_protected

  depends_on = [google_project_service.services]
}

resource "google_storage_bucket_iam_member" "agent_uploads_admin" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.agent.email}"
}

resource "google_storage_bucket_iam_member" "stats_uploads_viewer" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.mcp_stats.email}"
}
