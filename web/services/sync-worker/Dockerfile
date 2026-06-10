# Monorepo-aware build. Context = web/ (so packages/sync-core is reachable).
# sync-worker depends on @nexus-bhutan/sync-core (file:../../packages/sync-core),
# which must be built first; --install-links copies it in (no fragile symlink).

# ---- Stage 1: Builder ----
FROM node:20-alpine AS builder
WORKDIR /build

# Build the local workspace package first
COPY packages/sync-core/package.json packages/sync-core/tsconfig.json ./packages/sync-core/
RUN cd packages/sync-core && npm install --no-audit --no-fund
COPY packages/sync-core/src ./packages/sync-core/src
RUN cd packages/sync-core && npm run build

# Install + build sync-worker (file: dep resolves to ../../packages/sync-core)
COPY services/sync-worker/package.json services/sync-worker/tsconfig.json ./services/sync-worker/
RUN cd services/sync-worker && npm install --install-links --no-audit --no-fund
COPY services/sync-worker/src ./services/sync-worker/src
RUN cd services/sync-worker && npm run build

# ---- Stage 2: Runner ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

LABEL maintainer="shawnomanuel <shawn.manuel@gmail.com>"
LABEL org.opencontainers.image.title="NEXUS BHUTAN Sync Worker"
LABEL org.opencontainers.image.description="PouchDB-to-Supabase background sync for offline-resilient operations"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser

COPY --from=builder /build/services/sync-worker/dist ./dist
COPY --from=builder /build/services/sync-worker/node_modules ./node_modules

USER appuser

CMD ["node", "dist/index.js"]
