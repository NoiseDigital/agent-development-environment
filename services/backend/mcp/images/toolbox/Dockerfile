# MCP Toolbox for Cloud Run — the upstream toolbox image with this repo's
# tools.yaml baked in (Cloud Run has no bind mount). Built + pushed by CI; the
# Cloud Run service runs it internal-ingress only.
#
# tools.yaml pins `project: nd-agentspace-sbx`; BigQuery access comes from the
# Cloud Run runtime service account (ADC), which has the BigQuery roles.
FROM us-central1-docker.pkg.dev/database-toolbox/toolbox/toolbox:1.1.0

COPY tools.yaml /workspace/tools.yaml

# The base image's entrypoint is the `toolbox` binary; these are its args. Listen
# on the Cloud Run port (8080); no --ui in production.
CMD ["--config", "/workspace/tools.yaml", "--address", "0.0.0.0", "--port", "8080"]
