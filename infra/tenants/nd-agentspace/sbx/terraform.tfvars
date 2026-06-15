# nd-agentspace / sbx. Most values come from variable defaults; set the few here.
github_owner = "NoiseDigital"
github_repo  = "agent-platform"

# App Hosting frontend (git-connected). Developer Connect link created in
# us-central1 against NoiseDigital/agent-platform.
enable_app_hosting     = true
developer_connect_repo = "projects/nd-agentspace-sbx/locations/us-central1/connections/agent-platform/gitRepositoryLinks/NoiseDigital-agent-platform"

# Google Workspace SSO — set after creating an OAuth Web client (consent screen
# → Internal). Leaving these empty keeps Google sign-in disabled (email/password
# still works):
#   google_oauth_client_id     = "....apps.googleusercontent.com"
#   google_oauth_client_secret = "..."
