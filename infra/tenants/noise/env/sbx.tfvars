# noise / sbx → project nd-agentspace-sbx (derived <project_prefix>-<stage>).
stage = "sbx"

# Bootstrap admin (auto-provisioned admin on first sign-in); everyone else is
# invited via the admin UI. Must be in an allowed sign-in domain.
admin_emails = ["ethan.domokos@noisedigital.com"]

# Sandbox — keep it cheap.
db_tier = "db-f1-micro"

# Server-side tagging (sGTM): provisions the service + secret container. Add the
# GTM CONTAINER_CONFIG out-of-band, then roll the real image (DEPLOY.md §6).
enable_sgtm = true

# Datastream CDC → BigQuery (DEPLOY.md §7).
enable_datastream        = true
datastream_create_stream = true

# Google Workspace SSO is a SECRET — set it in env/sbx.secret.tfvars (gitignored),
# NOT here. Leaving it unset keeps Google sign-in off (email/password still works):
#   google_oauth_client_id     = "....apps.googleusercontent.com"
#   google_oauth_client_secret = "..."
