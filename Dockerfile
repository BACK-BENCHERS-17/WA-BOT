FROM node:24-slim AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# ─── Install dependencies ────────────────────────────────────────────────────
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY lib/db/package.json ./lib/db/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/whatsapp-bot/package.json ./artifacts/whatsapp-bot/

RUN pnpm install --frozen-lockfile

# ─── Copy source ─────────────────────────────────────────────────────────────
COPY . .

# ─── Build frontend ──────────────────────────────────────────────────────────
RUN pnpm --filter @workspace/whatsapp-bot run build

# ─── Build API server ─────────────────────────────────────────────────────────
RUN pnpm --filter @workspace/api-server run build

# ─── Production image ─────────────────────────────────────────────────────────
FROM node:24-slim AS runner

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace config for pnpm to resolve packages
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy only production package.json files
COPY lib/db/package.json ./lib/db/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/whatsapp-bot/package.json ./artifacts/whatsapp-bot/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder
COPY --from=base /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=base /app/artifacts/whatsapp-bot/dist ./artifacts/whatsapp-bot/dist

# Copy node_modules for externalized packages (baileys, etc.)
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/api/healthz').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "artifacts/api-server/dist/index.mjs"]
