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
