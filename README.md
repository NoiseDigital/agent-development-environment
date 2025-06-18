# Redeploy Agent Engine Service

- `Rebuild Image` -> gcloud builds submit --tag us-central1-docker.pkg.dev/probable-summer-238718/fastapi-repo/agent-engine-service:latest .

- `Push Image` -> terraform apply