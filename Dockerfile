# Thin runtime image over the host-built Next standalone output.
# Build on the host first: `npm run build` (outputs web/.next/standalone).
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0

# Standalone bundle (server.js + traced node_modules), then static + public.
COPY web/.next/standalone ./
COPY web/.next/static ./web/.next/static
COPY web/public ./web/public

CMD node web/server.js
