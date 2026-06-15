# ─────────────────────────────────────────────────────────────────────────────
# Firebase — provisioned as code (no `firebase init`). This module owns:
#   - the Firebase project (enables Firebase on the GCP project),
#   - a registered web app (its config feeds the frontend's NEXT_PUBLIC_* vars),
#   - Identity Platform = Firebase Auth (sign-in providers + authorized domains),
#   - optionally, the App Hosting backend (git-connected frontend deploy).
#
# All Firebase resources use the google-beta provider.
# ─────────────────────────────────────────────────────────────────────────────

resource "google_firebase_project" "this" {
  provider = google-beta
  project  = local.project_id

  depends_on = [google_project_service.services]
}

resource "google_firebase_web_app" "this" {
  provider        = google-beta
  project         = local.project_id
  display_name    = "${local.name_prefix} web"
  deletion_policy = "DELETE"

  depends_on = [google_firebase_project.this]
}

# Web app config (apiKey, authDomain, appId, …) — surfaced as outputs so the
# frontend's apphosting.yaml / NEXT_PUBLIC_* values come from Terraform, not
# hand-copied console values.
data "google_firebase_web_app_config" "this" {
  provider   = google-beta
  project    = local.project_id
  web_app_id = google_firebase_web_app.this.app_id
}

# Identity Platform = Firebase Auth. Email/password on by default; add OAuth
# IdPs (Google, etc.) via google_identity_platform_default_supported_idp_config.
resource "google_identity_platform_config" "auth" {
  provider = google-beta
  project  = local.project_id

  sign_in {
    email {
      enabled           = true
      password_required = true
    }
  }

  authorized_domains = [
    "localhost",
    "${local.project_id}.firebaseapp.com",
    "${local.project_id}.web.app",
  ]

  depends_on = [google_firebase_project.this]
}

# Google sign-in (Workspace SSO). Gated on an OAuth client — create one
# (APIs & Services → Credentials → OAuth client, type "Web") and set the vars.
# Empty client id leaves it disabled (email/password still works).
resource "google_identity_platform_default_supported_idp_config" "google" {
  count    = var.google_oauth_client_id == "" ? 0 : 1
  provider = google-beta
  project  = local.project_id

  idp_id        = "google.com"
  client_id     = var.google_oauth_client_id
  client_secret = var.google_oauth_client_secret
  enabled       = true

  depends_on = [google_identity_platform_config.auth]
}

# ── App Hosting backend (git-connected frontend) ────────────────────────────
# Builds services/frontend on push to app_hosting_branch and rolls out a Cloud
# Run revision Firebase manages for you. Gated on the Developer Connect link
# (one-time interactive GitHub authorization — see infra/README.md).

# Identity App Hosting builds & serves the frontend as. Reads the web API key
# secret referenced in apphosting.yaml.
resource "google_service_account" "app_hosting" {
  project      = local.project_id
  account_id   = "apphosting"
  display_name = "Firebase App Hosting (${local.name_prefix})"
}

resource "google_project_iam_member" "app_hosting_runner" {
  for_each = toset([
    "roles/secretmanager.secretAccessor", # apphosting.yaml secret env (web API key)
    "roles/artifactregistry.reader",      # pull the build it produces
  ])
  project = local.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.app_hosting.email}"
}

resource "google_firebase_app_hosting_backend" "frontend" {
  count    = var.enable_app_hosting && var.developer_connect_repo != "" ? 1 : 0
  provider = google-beta

  project          = local.project_id
  location         = var.region
  backend_id       = "frontend"
  app_id           = google_firebase_web_app.this.app_id
  serving_locality = "GLOBAL_ACCESS"
  service_account  = google_service_account.app_hosting.email

  codebase {
    repository     = var.developer_connect_repo
    root_directory = "services/frontend"
  }

  depends_on = [google_firebase_project.this]
}
