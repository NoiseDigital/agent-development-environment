# Server-side Google Tag Manager — Google's prebuilt server image, re-published
# into THIS repo's Artifact Registry by CI so deploys pull from our registry,
# not gcr.io/cloud-tagging-10302018 directly. Same pattern as
# services/backend/mcp/images/toolbox (an upstream image we run unchanged).
#
# `:stable` is Google's released channel (see release notes:
# https://developers.google.com/tag-platform/tag-manager/server-side/release-notes).
# CI snapshots whatever :stable resolves to AT BUILD TIME into an immutable
# `$SHA` tag in our AR, so every deploy runs a frozen copy even though the
# upstream tag is mutable. For full upstream reproducibility, pin a digest:
#   FROM gcr.io/cloud-tagging-10302018/gtm-cloud-image@sha256:<digest>
FROM gcr.io/cloud-tagging-10302018/gtm-cloud-image:stable

# No customization: there is nothing to bake. The container is configured
# entirely at runtime via env vars — CONTAINER_CONFIG (the server container's
# config string from "Manually provision tagging server") and the optional
# PREVIEW_SERVER_URL — injected by Cloud Run (from a Secret) / compose. The base
# image's own entrypoint starts the tagging server on $PORT (8080).
