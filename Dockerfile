# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24-alpine

# ── Dependencies ──────────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ── Build (tests run first: a failing security test fails the image) ──
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
# basePath is inlined into the client bundle at build time.
ARG OBSIDECK_BASE_PATH=/obsideck
ENV OBSIDECK_BASE_PATH=${OBSIDECK_BASE_PATH} \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm test && npm run build

# ── Runtime: standalone server only, non-root ─────────────────
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ARG OBSIDECK_BASE_PATH=/obsideck
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    OBSIDIAN_VAULT_PATH=/vault \
    OBSIDECK_BASE_PATH=${OBSIDECK_BASE_PATH}

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+process.env.OBSIDECK_BASE_PATH+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
