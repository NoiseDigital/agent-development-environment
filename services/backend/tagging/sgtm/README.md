# Server-side Google Tag Manager (sGTM)

Google's official server-tagging container, run as one of our services. The
browser's `gtag.js` posts measurement data to this server (`server_container_url`)
instead of straight to Google; the tags/triggers you author in the GTM UI then
shape it and route it onward to GA4 (and anywhere else you configure).

```
browser (gtag.js, NEXT_PUBLIC_GA_MEASUREMENT_ID)
   │  server_container_url
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

## Prerequisite — the GTM Server container (one-time, manual)

The container's tag config lives in GTM, referenced by a `CONTAINER_CONFIG`
string. Only you can create it:

1. <https://tagmanager.google.com> → **Admin → Create Container** (or *Add a new
   account*) → **Target platform: Server**.
2. When the container opens, choose **Manually provision tagging server** (NOT
   "automatically provision" — that spins up an App Engine instance we don't
   want; we run our own Cloud Run).
3. Copy the **Container Config** string. (Later: container ID, top-right →
   *Manually provision tagging server* to view it again.)

That string is `SGTM_CONTAINER_CONFIG` (local) / the `sgtm-container-config`
Secret (prod). Until it's set, the service is disabled everywhere — see below.

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

```bash
# .env
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-PSTSB8D377
NEXT_PUBLIC_GA_SERVER_CONTAINER_URL=http://localhost:8090
SGTM_CONTAINER_CONFIG='<paste the Container Config string>'

docker compose --profile tagging up sgtm frontend
```

The frontend's `gtag` then posts to `http://localhost:8090` (this service). To
debug tags in the GTM UI, run a second container with
`RUN_AS_PREVIEW_SERVER=true` and point `PREVIEW_SERVER_URL` at it.

## Production

Wired in [infra/modules/tenant/sgtm.tf](../../../../infra/modules/tenant/sgtm.tf),
**config-gated**: nothing is created until `var.sgtm_container_config` is set, so
a tenant without tagging deploys cleanly.

1. Provide the config (stored in Secret Manager, never the repo):
   ```bash
   TF_VAR_sgtm_container_config='<Container Config string>' terraform apply
   ```
2. CI builds + pushes `…/sgtm:$SHA` and rolls the service (the deploy step is
   skipped automatically when the service isn't provisioned). After first
   enabling it, run the deploy workflow (`workflow_dispatch`) to roll the real
   image over the placeholder.
3. Take the `sgtm_url` Terraform output and set it as the GitHub var
   `NEXT_PUBLIC_GA_SERVER_CONTAINER_URL` (+ `NEXT_PUBLIC_GA_MEASUREMENT_ID`); the
   next frontend build bakes them in.

> sbx runs `min_instance_count = 0` to stay cheap. For a production tagging
> server bump it to ≥ 1 — sGTM cold starts delay/drop measurement hits.

## References

- [Set up server-side tagging with Cloud Run (manual)](https://developers.google.com/tag-platform/tag-manager/server-side/cloud-run-setup-guide?provisioning=manual)
- [Manual setup guide](https://developers.google.com/tag-platform/tag-manager/server-side/manual-setup-guide)
- [Docker image release notes](https://developers.google.com/tag-platform/tag-manager/server-side/release-notes)
