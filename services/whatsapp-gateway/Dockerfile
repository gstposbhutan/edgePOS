# ---- Stage 1: Dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ---- Stage 2: Builder ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ---- Stage 3: Runner ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

LABEL maintainer="shawnomanuel <shawn.manuel@gmail.com>"
LABEL org.opencontainers.image.title="NEXUS BHUTAN WhatsApp Gateway"
LABEL org.opencontainers.image.description="Meta Cloud API microservice for PDF delivery and alerts"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser

COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules

USER appuser

EXPOSE 3001

CMD ["node", "dist/index.js"]
