import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { tryRestoreSession } from "./lib/whatsapp-service";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// ─── Serve React frontend in production ─────────────────────────────────────
// In Render/VPS the frontend is pre-built. Express serves it as static files.
// In development, Vite dev server handles the frontend separately.
if (process.env.NODE_ENV === "production") {
  // Relative to the repo root where `node artifacts/api-server/dist/index.mjs` is run
  const candidates = [
    path.resolve(process.cwd(), "artifacts/whatsapp-bot/dist/public"),
    path.resolve(__dirname, "../../../artifacts/whatsapp-bot/dist/public"),
    path.resolve(__dirname, "../../whatsapp-bot/dist/public"),
  ];
  const frontendDist = candidates.find((p) => fs.existsSync(p));

  if (frontendDist) {
    logger.info({ frontendDist }, "Serving frontend static files");
    app.use(express.static(frontendDist));
    // SPA fallback — serve index.html for any non-API route
    app.get("*", (_req, res) => {
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  } else {
    logger.warn("Frontend dist not found — only API routes will be served");
  }
}

// Try to restore an existing WhatsApp session from DB on startup
tryRestoreSession().catch((err) => {
  logger.warn({ err }, "Could not restore WhatsApp session on startup");
});

export default app;
