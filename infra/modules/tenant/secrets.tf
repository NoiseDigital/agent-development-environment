# ─────────────────────────────────────────────────────────────────────────────
# Secret Manager — the database URL. Cloud Run services read it as a secret env
# var (see cloudrun.tf), so the connection string is never baked into an image
# or a tfvars file in plaintext at rest.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  # asyncpg URL against the instance's private IP. SQLAlchemy + asyncpg is what
  # the gateway/agent expect (see services/backend/*/api/db.py).
  database_url = "postgresql+asyncpg://${google_sql_user.app.name}:${random_password.db.result}@${google_sql_database_instance.postgres.private_ip_address}:5432/${google_sql_database.app.name}"
}

resource "google_secret_manager_secret" "database_url" {
  project   = local.project_id
  secret_id = "database-url"

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = local.database_url
}

# Services that connect to Postgres get read access to the secret.
resource "google_secret_manager_secret_iam_member" "database_url_accessors" {
  for_each = toset([
    google_service_account.gateway.email,
    google_service_account.agent.email,
  ])
  project   = local.project_id
  secret_id = google_secret_manager_secret.database_url.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${each.value}"
}

# ── Firebase web API key ─────────────────────────────────────────────────────
# Kept in Secret Manager (no keys in the repo). apphosting.yaml references it as
# `secret: firebase-web-api-key`. Sourced from the web-app config data source so
# every tenant gets it automatically.
resource "google_secret_manager_secret" "firebase_web_api_key" {
  project   = local.project_id
  secret_id = "firebase-web-api-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_version" "firebase_web_api_key" {
  secret      = google_secret_manager_secret.firebase_web_api_key.id
  secret_data = data.google_firebase_web_app_config.this.api_key
}

# The App Hosting service agent (gcp-sa-firebaseapphosting) — provisioned so the
# version-manager grant below has a real member on a fresh tenant.
resource "google_project_service_identity" "firebaseapphosting" {
  provider   = google-beta
  project    = local.project_id
  service    = "firebaseapphosting.googleapis.com"
  depends_on = [google_project_service.services]
}

# The exact secret-LEVEL grants `firebase apphosting:secrets:grantaccess` sets,
# as code — so the frontend build + rollout resolve the secret with no manual
# CLI step: the compute SA reads + views it; the service agent manages versions.
resource "google_secret_manager_secret_iam_member" "firebase_web_api_key_apphosting" {
  count     = var.enable_app_hosting && var.developer_connect_repo != "" ? 1 : 0
  project   = local.project_id
  secret_id = google_secret_manager_secret.firebase_web_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.app_hosting_sa}"
}

resource "google_secret_manager_secret_iam_member" "fwak_compute_viewer" {
  count     = var.enable_app_hosting && var.developer_connect_repo != "" ? 1 : 0
  project   = local.project_id
  secret_id = google_secret_manager_secret.firebase_web_api_key.secret_id
  role      = "roles/secretmanager.viewer"
  member    = "serviceAccount:${local.app_hosting_sa}"
}

resource "google_secret_manager_secret_iam_member" "fwak_apphosting_version_mgr" {
  count     = var.enable_app_hosting && var.developer_connect_repo != "" ? 1 : 0
  project   = local.project_id
  secret_id = google_secret_manager_secret.firebase_web_api_key.secret_id
  role      = "roles/secretmanager.secretVersionManager"
  member    = "serviceAccount:${google_project_service_identity.firebaseapphosting.email}"
}
