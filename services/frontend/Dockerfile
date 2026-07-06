FROM node:24-slim AS deps

ENV PORT=3000
WORKDIR /app

# Install dependencies into the image so a fresh container has node_modules
# ready to go. At dev-time the container ALSO mounts a named volume on top
# of /app/node_modules (compose: `frontend_node_modules`) for speed — but
# that volume is created ONCE per machine and never refreshes when the
# lockfile moves. The CMD below runs `npm install` on every start so the
# volume's node_modules stays in sync with package-lock.json: it's a fast
# no-op when nothing changed and a proper install when a teammate pulls a
# new dependency.
COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

EXPOSE 3000
CMD ["sh", "-c", "npm install --no-audit --no-fund && npm run dev"]

# ── Production build (Cloud Run) ──────────────────────────────────────────────
FROM deps AS builder
# Explicit prod NODE_ENV: Next 15 mis-prerenders the error pages under a
# non-standard NODE_ENV (the deps stage leaves it unset for `next dev`).
ENV NODE_ENV=production
# NEXT_PUBLIC_* are inlined into the client bundle at build time, so they're
# build args. CI passes the public Firebase config (project/authDomain/appId)
# and reads the API key from Secret Manager — nothing committed to the repo.
# Tenant (branding + enabled modules) — defaults to noise so a plain build is the
# full platform; CI passes the environment's tenant.
ARG NEXT_PUBLIC_TENANT=noise
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_API_KEY
# Google Analytics (gtag.js). The GA4 measurement id is NOT a build arg — it's
# baked per-tenant via NEXT_PUBLIC_TENANT (tenants/<id>.json → analytics.
# measurementId) so a tenant can't inherit another's property. Only the sGTM
# relay endpoint is passed here — it's environment-specific, not a property id.
ARG NEXT_PUBLIC_GA_SERVER_CONTAINER_URL
ENV NEXT_PUBLIC_TENANT=$NEXT_PUBLIC_TENANT \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_GA_SERVER_CONTAINER_URL=$NEXT_PUBLIC_GA_SERVER_CONTAINER_URL
COPY . .
RUN npm run build

FROM node:24-slim AS runner
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
COPY --from=builder /app/public ./public
# Per-tenant asset isolation: keep ONLY this tenant's public/<tenant>/ dir, drop
# every other tenant's — so a deployed tenant can't serve another's brand assets
# by direct URL. Shared root files (file.svg, …) are files, untouched.
ARG NEXT_PUBLIC_TENANT=noise
RUN find public -mindepth 1 -maxdepth 1 -type d ! -name "$NEXT_PUBLIC_TENANT" -exec rm -rf {} +
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 8080
CMD ["node", "server.js"]
