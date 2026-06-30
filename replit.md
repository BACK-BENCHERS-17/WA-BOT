# WA Command — WhatsApp Customer Service Bot

Auto-reply WhatsApp bot with a real-time dashboard. Connect any WhatsApp number via pairing code, set keyword rules, and let the bot reply to customers automatically.

## Run & Operate (Development)

- Workflows auto-start: `API Server` (port 8080) and `WhatsApp Bot Dashboard` (Vite dev server)
- `pnpm --filter @workspace/api-server run build` — rebuild API after changes
- `pnpm --filter @workspace/db run push` — apply DB schema changes
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks from OpenAPI spec
- Required env: `DATABASE_URL`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (port 8080, proxied at `/api`)
- DB: PostgreSQL + Drizzle ORM
- WhatsApp: @whiskeysockets/baileys v7 RC (pairing code, no QR)
- Frontend: React + Vite + Wouter + TanStack Query + shadcn/ui
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Build: esbuild (ESM bundle)

## Where things live

- `lib/db/src/schema/whatsapp.ts` — DB schema (source of truth)
- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth for API)
- `artifacts/api-server/src/lib/whatsapp-service.ts` — Baileys WA connection logic
- `artifacts/api-server/src/lib/wa-db-auth.ts` — PostgreSQL-based Baileys auth state
- `artifacts/whatsapp-bot/src/` — React frontend (pages/, components/)
- `render.yaml` — Render deployment config
- `Dockerfile` — Docker deployment config

## Architecture decisions

- **WhatsApp session in PostgreSQL** (`wa_auth_state` table) — Render/VPS filesystem is ephemeral; all Baileys credentials stored in DB so session survives restarts
- **Single Render service** — Express serves both `/api/*` routes and the pre-built React SPA static files in production; in dev, Vite runs separately
- **No QR code** — pairing code flow only (enter phone → get 8-char code → link on phone)
- **Baileys externalized from bundle** — `@whiskeysockets/baileys` and `@hapi/boom` are not bundled by esbuild; loaded from `node_modules` at runtime

## Deploy to Render (Recommended)

1. Push code to GitHub
2. Go to [render.com](https://render.com) → New → Blueprint
3. Select your repo — Render reads `render.yaml` and creates the web service + PostgreSQL DB automatically
4. After deploy, open your `.onrender.com` URL → Session page → enter your WhatsApp number
5. Pairing code appears → enter it in WhatsApp on your phone → bot goes live

## Deploy with Docker

```bash
docker build -t wa-command .
docker run -p 8080:8080 \
  -e DATABASE_URL="postgres://..." \
  -e SESSION_SECRET="your-secret" \
  -e NODE_ENV=production \
  wa-command
```

Then open `http://localhost:8080` → Session page → connect WhatsApp.

## Deploy to VPS (Manual)

```bash
git clone <your-repo>
cd <repo>
npm install -g pnpm
pnpm install
pnpm --filter @workspace/whatsapp-bot run build
pnpm --filter @workspace/api-server run build
NODE_ENV=production DATABASE_URL="postgres://..." SESSION_SECRET="secret" PORT=8080 \
  node artifacts/api-server/dist/index.mjs
```

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `SESSION_SECRET` | Random secret for sessions | Yes |
| `NODE_ENV` | Set to `production` on server | Yes |
| `PORT` | Server port (Render sets this) | Auto |

## Gotchas

- WhatsApp blocks WebSocket connections from Replit/AWS/GCP datacenter IPs. Connect from deployed VPS/Render only.
- After `pnpm --filter @workspace/db run push`, restart the API workflow to pick up schema changes.
- `BASE_PATH` and `PORT` are not required during `vite build` (only for dev server).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
