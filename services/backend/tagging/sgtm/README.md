# Server-side Google Tag Manager (sGTM)

Google's official server-tagging container, run as one of our services. The
browser's `gtag.js` posts measurement data to this server (`server_container_url`)
instead of straight to Google; the tags/triggers you author in the GTM UI then
shape it and route it onward to GA4 (and anywhere else you configure).

```
frontend (gtag.js, measurement id baked per-tenant in tenants/<id>.json)
   │  server_container_url  (NEXT_PUBLIC_GA_SERVER_CONTAINER_URL)
   ▼
sGTM  ──►  GA4  (+ other destinations)
 local:  docker compose --profile tagging  (port 8090)
 prod:   Cloud Run service `sgtm`  (us-central1, public ingress)
```

This is an **image-based service**: we run Google's prebuilt
`gtm-cloud-image` unchanged (config is injected at runtime, nothing is baked),
the same way `services/backend/mcp/images/toolbox` runs the upstream toolbox
image. The [Dockerfile](./Dockerfile) only pins the upstream image and
re-publishes it into our Artifact Registry via CI, so deploys pull from our
registry rather than `gcr.io/cloud-tagging-10302018` directly.

The container's tag config lives in GTM (a *Server* container you create at
tagmanager.google.com), referenced by a **`CONTAINER_CONFIG`** string. Locally
that's `SGTM_CONTAINER_CONFIG` in `.env`; in prod it's the value of the
`sgtm-container-config` Secret Manager secret (added out-of-band — never in the
repo, tfvars, or state). Creating the container and wiring the value is part of
deploy setup → **[DEPLOY.md §6](../../../../DEPLOY.md)**.

## Environment variables

| Var | Required | Purpose |
| --- | --- | --- |
| `CONTAINER_CONFIG` | yes | The server container's config string (from *Manually provision tagging server*). Empty = the container won't start, which is why it's gated off until set. |
| `PORT` | no | Listen port (we use 8080). |
| `PREVIEW_SERVER_URL` | no | HTTPS URL of a preview server — set on the **tagging** server to enable GTM's debug/preview. Optional; tagging works without it. |
| `RUN_AS_PREVIEW_SERVER` | no | `true` runs this container as a *preview* server instead of a tagging server. |

## Local dev

The compose service is **profile-gated** (`tagging`) so it stays off until you
have a config — an empty `CONTAINER_CONFIG` would crash-loop a normal `up`.

The GA4 measurement id is baked **per-tenant** (`tenants/<id>.json` →
`analytics.measurementId`), not set via env — so to exercise tagging locally,
make sure the tenant you build has a non-empty id (noise's sbx stream is
`G-PSTSB8D377`) and re-run `node scripts/gen-tenant-config.mjs`. Only the relay
URL is env-driven:

```bash
# .env
NEXT_PUBLIC_GA_SERVER_CONTAINER_URL=http://localhost:8090
SGTM_CONTAINER_CONFIG='<paste the Container Config string>'

docker compose --profile tagging up sgtm frontend
```

The frontend's `gtag` then posts to `http://localhost:8090` (this service). To
debug tags in the GTM UI, run a second container with
`RUN_AS_PREVIEW_SERVER=true` and point `PREVIEW_SERVER_URL` at it.

## Deploying it

Provisioned (gated) in [infra/modules/tenant/sgtm.tf](../../../../infra/modules/tenant/sgtm.tf);
the ordered setup — GTM container, the `enable_sgtm` toggle, the out-of-band
secret, rolling the real image, publishing the GA4 tag, and the frontend GitHub
vars — is **[DEPLOY.md §6](../../../../DEPLOY.md)**.

**Design note.** Existence is a *committed* `enable_sgtm` toggle, kept separate
from the *secret value* (which lives only in Secret Manager — Terraform seeds a
`REPLACE_VIA_GCLOUD` placeholder version with `ignore_changes`, and the real value
is added out-of-band). So a routine `terraform apply` can never destroy the
service for a missing var, and the config never lands in the repo or state.
sbx runs `min_instance_count = 0` to stay cheap; a production tagging server wants
≥ 1 — sGTM cold starts delay/drop hits.

## References

- [Set up server-side tagging with Cloud Run (manual)](https://developers.google.com/tag-platform/tag-manager/server-side/cloud-run-setup-guide?provisioning=manual)
- [Manual setup guide](https://developers.google.com/tag-platform/tag-manager/server-side/manual-setup-guide)
- [Docker image release notes](https://developers.google.com/tag-platform/tag-manager/server-side/release-notes)
