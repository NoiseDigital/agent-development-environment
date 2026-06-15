# nd-agentspace / sbx. Most values come from variable defaults; set the few here.
github_owner = "NoiseDigital"
github_repo  = "agent-platform"

# Auto-provision as admin on first sign-in (bootstrap; everyone else is invited
# via the admin UI). Must be in the allowed sign-in domain.
admin_emails = ["ethan.domokos@noisedigital.com"]

# App Hosting frontend (git-connected). The backend + GitHub connection were
# created in the Firebase console (App Hosting requires the Firebase GitHub App);
# TF manages them via this link (the Firebase-app connection, not the standalone
# Developer Connect one — that older link is unused and can be deleted).
enable_app_hosting     = true
developer_connect_repo = "projects/nd-agentspace-sbx/locations/us-central1/connections/apphosting-github-conn-1vvs8jd/gitRepositoryLinks/NoiseDigital-agent-platform"

# Google Workspace SSO — set after creating an OAuth Web client (consent screen
# → Internal). Leaving these empty keeps Google sign-in disabled (email/password
# still works):
#   google_oauth_client_id     = "....apps.googleusercontent.com"
#   google_oauth_client_secret = "..."
