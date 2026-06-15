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
# This is PUBLIC client config — it ships in the browser bundle; Firebase
# security comes from Auth rules + authorized domains, not from hiding it. We
# keep it in Secret Manager only so it isn't committed to the repo, and source
# it from the web-app config data source so every tenant gets it automatically.
# apphosting.yaml references it as `secret: firebase-web-api-key`; the App
# Hosting SA's project-level secretAccessor (firebase.tf) covers read access.
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

# App Hosting's secret resolver validates a SECRET-LEVEL binding — a project-level
# secretAccessor is NOT honored by it — so grant the App Hosting compute SA
# accessor on this secret directly. This is what `firebase apphosting:secrets:
# grantaccess` does; without it the frontend build fails with "Misconfigured
# secret". (app_hosting_sa local + the App Hosting gate live in firebase.tf.)
resource "google_secret_manager_secret_iam_member" "firebase_web_api_key_apphosting" {
  count     = var.enable_app_hosting && var.developer_connect_repo != "" ? 1 : 0
  project   = local.project_id
  secret_id = google_secret_manager_secret.firebase_web_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${local.app_hosting_sa}"
}
