# nd-agentspace / sbx. Most values come from variable defaults; set the few here.
github_owner = "NoiseDigital"
github_repo  = "agent-platform"

# Flip on once the Developer Connect GitHub link exists (see infra/README.md):
#   enable_app_hosting     = true
#   developer_connect_repo = "projects/<p>/locations/<r>/connections/<c>/gitRepositoryLinks/<link>"
enable_app_hosting     = false
developer_connect_repo = ""

# Google Workspace SSO — set after creating an OAuth Web client (consent screen
# → Internal). Leaving these empty keeps Google sign-in disabled (email/password
# still works):
#   google_oauth_client_id     = "....apps.googleusercontent.com"
#   google_oauth_client_secret = "..."
