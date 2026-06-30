FROM node:24-slim AS base

# Pin exact pnpm version matching the repo
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

# ─── Copy workspace manifests for install layer cache ─────────────────────────
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY scripts/package.json                          ./scripts/
COPY lib/db/package.json                           ./lib/db/
COPY lib/api-spec/package.json                     ./lib/api-spec/
COPY lib/api-zod/package.json                      ./lib/api-zod/
COPY lib/api-client-react/package.json             ./lib/api-client-react/
COPY artifacts/api-server/package.json             ./artifacts/api-server/
COPY artifacts/whatsapp-bot/package.json           ./artifacts/whatsapp-bot/
COPY artifacts/mockup-sandbox/package.json         ./artifacts/mockup-sandbox/

# Install all deps (no frozen-lockfile — overrides differ by platform)
RUN pnpm install --no-frozen-lockfile

# ─── Copy full source and build ───────────────────────────────────────────────
COPY . .

# Build React frontend (BASE_PATH=/ for root serving)
RUN BASE_PATH=/ pnpm --filter @workspace/whatsapp-bot run build

# Build Express API
RUN pnpm --filter @workspace/api-server run build

# ─── Production runner image ──────────────────────────────────────────────────
FROM node:24-slim AS runner

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

# Copy workspace manifests
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY scripts/package.json                          ./scripts/
COPY lib/db/package.json                           ./lib/db/
COPY lib/api-spec/package.json                     ./lib/api-spec/
COPY lib/api-zod/package.json                      ./lib/api-zod/
COPY lib/api-client-react/package.json             ./lib/api-client-react/
COPY artifacts/api-server/package.json             ./artifacts/api-server/
COPY artifacts/whatsapp-bot/package.json           ./artifacts/whatsapp-bot/
COPY artifacts/mockup-sandbox/package.json         ./artifacts/mockup-sandbox/

# Production deps only
RUN pnpm install --no-frozen-lockfile --prod

# Copy built output from builder
COPY --from=base /app/artifacts/api-server/dist      ./artifacts/api-server/dist
COPY --from=base /app/artifacts/whatsapp-bot/dist    ./artifacts/whatsapp-bot/dist

# Copy externalized runtime packages (baileys, hapi/boom, etc.)
COPY --from=base /app/node_modules                   ./node_modules
COPY --from=base /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/api/healthz').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "artifacts/api-server/dist/index.mjs"]
