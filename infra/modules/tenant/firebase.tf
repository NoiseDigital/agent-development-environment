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
# frontend's NEXT_PUBLIC_* build args come from Terraform, not hand-copied
# console values.
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

  # Default Firebase domains + the frontend Cloud Run URL, so login works on the
  # deployed app with no manual "add authorized domain" step.
  authorized_domains = [
    "localhost",
    "${local.project_id}.firebaseapp.com",
    "${local.project_id}.web.app",
    trimprefix(google_cloud_run_v2_service.frontend.uri, "https://"),
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

# The frontend is a regular Cloud Run service we own (cloudrun.tf) — built +
# deployed by our CI, not Firebase App Hosting. Firebase here provides Auth only
# (project, web app config, Identity Platform). No App Hosting backend.
