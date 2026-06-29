import { Router } from "express";
import { db } from "@workspace/db";
import { sessionsTable } from "@workspace/db";
import { connectWhatsApp, disconnectWhatsApp, waEvents } from "../lib/whatsapp-service";

const router = Router();

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
    const { phoneNumber } = req.body as { phoneNumber: string };
    if (!phoneNumber || typeof phoneNumber !== "string") {
      return res.status(400).json({ error: "phoneNumber is required" });
    }

    const result = await connectWhatsApp(phoneNumber);
    res.json(result);
  } catch (err: any) {
    req.log.error({ err }, "Failed to connect WhatsApp");
    res.status(500).json({ error: err?.message ?? "Failed to start session" });
  }
});

router.post("/session/disconnect", async (req, res) => {
  try {
    await disconnectWhatsApp();
    res.json({ success: true, message: "Session disconnected successfully." });
  } catch (err) {
    req.log.error({ err }, "Failed to disconnect session");
    res.status(500).json({ error: "Internal server error" });
  }
});

// SSE endpoint for real-time updates
router.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const onSession = (data: unknown) => send("session_update", data);
  const onMessage = (data: unknown) => send("new_message", data);
  const onActivity = (data: unknown) => send("activity", data);

  waEvents.on("session_update", onSession);
  waEvents.on("new_message", onMessage);
  waEvents.on("activity", onActivity);

  // heartbeat every 20s
  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, 20000);

  req.on("close", () => {
    clearInterval(heartbeat);
    waEvents.off("session_update", onSession);
    waEvents.off("new_message", onMessage);
    waEvents.off("activity", onActivity);
  });
});

export default router;
