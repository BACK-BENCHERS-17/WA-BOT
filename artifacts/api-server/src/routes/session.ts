import { Router } from "express";
import { db } from "@workspace/db";
import { sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { randomUUID } from "crypto";

const router = Router();

function generatePairingCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function getOrCreateSession() {
  const existing = await db.select().from(sessionsTable).limit(1);
  if (existing.length > 0) return existing[0];
  const [created] = await db.insert(sessionsTable).values({}).returning();
  return created;
}

router.get("/session/status", async (req, res) => {
  try {
    const session = await getOrCreateSession();
    res.json({
      connected: session.connected,
      phoneNumber: session.phoneNumber ?? null,
      name: session.name ?? null,
      lastSeen: session.lastSeen ? session.lastSeen.toISOString() : null,
      status: session.status,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get session status");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/session/connect", async (req, res) => {
  try {
    const session = await getOrCreateSession();
    const code = generatePairingCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await db
      .update(sessionsTable)
      .set({
        status: "connecting",
        pairingCode: code,
        pairingCodeExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(sessionsTable.id, session.id));

    res.json({
      code,
      expiresAt: expiresAt.toISOString(),
      instructions:
        "Open WhatsApp on your phone, go to Settings > Linked Devices > Link a Device, then enter this code.",
    });
  } catch (err) {
    req.log.error({ err }, "Failed to generate pairing code");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/session/disconnect", async (req, res) => {
  try {
    const session = await getOrCreateSession();
    await db
      .update(sessionsTable)
      .set({
        connected: false,
        status: "disconnected",
        phoneNumber: null,
        name: null,
        pairingCode: null,
        pairingCodeExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(sessionsTable.id, session.id));

    res.json({ success: true, message: "Session disconnected successfully." });
  } catch (err) {
    req.log.error({ err }, "Failed to disconnect session");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
