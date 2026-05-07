FROM node:24-slim AS deps

ENV PORT=3000
WORKDIR /app

# Install dependencies only — source is provided via bind mount at runtime.
# This layer is cached so npm install doesn't re-run on every container start.
COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

EXPOSE 3000
CMD ["npm", "run", "dev"]

# ── Production build ──────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .
RUN npm run build

FROM node:24-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
