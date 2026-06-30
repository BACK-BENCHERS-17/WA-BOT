import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import {
  sessionsTable,
  contactsTable,
  messagesTable,
  botConfigTable,
  botRulesTable,
  activityLogTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { usePostgresAuthState, clearAuthState, hasAuthState } from "./wa-db-auth";

export const waEvents = new EventEmitter();
waEvents.setMaxListeners(200);

let sock: any = null;

// ─── DB helpers ─────────────────────────────────────────────────────────────

async function getOrCreateSession() {
  const rows = await db.select().from(sessionsTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db.insert(sessionsTable).values({}).returning();
  return created;
}

async function setSessionStatus(
  status: "disconnected" | "connecting" | "connected" | "error",
  extra: { phoneNumber?: string | null; name?: string | null } = {}
) {
  const session = await getOrCreateSession();
  await db
    .update(sessionsTable)
    .set({ status, connected: status === "connected", ...extra, updatedAt: new Date() })
    .where(eq(sessionsTable.id, session.id));
  waEvents.emit("session_update", { status, ...extra });
}

async function addActivity(type: string, description: string, contactName?: string) {
  try {
    await db.insert(activityLogTable).values({
      id: randomUUID(),
      type,
      description,
      contactName: contactName ?? null,
    });
    waEvents.emit("activity", { type, description, contactName });
  } catch (_) {}
}

async function upsertContact(jid: string, name: string, phoneNumber: string) {
  const rows = await db.select().from(contactsTable).where(eq(contactsTable.id, jid)).limit(1);
  if (rows.length === 0) {
    await db.insert(contactsTable).values({
      id: jid, name, phoneNumber,
      lastMessageAt: new Date(), messageCount: 1, unreadCount: 1,
    });
  } else {
    await db.update(contactsTable).set({
      name,
      lastMessageAt: new Date(),
      messageCount: sql`${contactsTable.messageCount} + 1`,
      unreadCount: sql`${contactsTable.unreadCount} + 1`,
    }).where(eq(contactsTable.id, jid));
  }
}

async function findMatchingRule(text: string) {
  const rules = await db.select().from(botRulesTable).where(eq(botRulesTable.enabled, true));
  const lower = text.toLowerCase();
  for (const rule of rules) {
    const kw = rule.keyword.toLowerCase();
    if (rule.matchType === "exact" && lower === kw) return rule;
    if (rule.matchType === "contains" && lower.includes(kw)) return rule;
    if (rule.matchType === "startsWith" && lower.startsWith(kw)) return rule;
  }
  return null;
}

// ─── Message handler ─────────────────────────────────────────────────────────

async function handleIncoming(jid: string, text: string, pushName: string) {
  const phoneNumber = jid.replace("@s.whatsapp.net", "");
  const contactName = pushName || phoneNumber;
  const msgId = randomUUID();

  await upsertContact(jid, contactName, phoneNumber);
  await db.insert(messagesTable).values({
    id: msgId, contactId: jid, contactName,
    text, direction: "inbound", isAutoReply: false, status: "received",
  });
  waEvents.emit("new_message", { id: msgId, contactId: jid, contactName, text, direction: "inbound" });
  await addActivity("message_received", `Message from ${contactName}`, contactName);

  const configs = await db.select().from(botConfigTable).limit(1);
  const config = configs[0];
  if (!config?.enabled) return;

  const rule = await findMatchingRule(text);
  if (!rule) return;

  await new Promise((r) => setTimeout(r, Math.max((config.autoReplyDelay ?? 1) * 1000, 800)));

  const replyText = rule.response
    .replace("{name}", contactName)
    .replace("{business}", config.businessName);

  if (sock) {
    try { await sock.sendMessage(jid, { text: replyText }); }
    catch (err) { logger.error({ err }, "Failed to send WA message"); return; }
  }

  const replyId = randomUUID();
  await db.insert(messagesTable).values({
    id: replyId, contactId: jid, contactName,
    text: replyText, direction: "outbound", isAutoReply: true, status: "sent",
  });
  await db.update(botRulesTable)
    .set({ triggerCount: sql`${botRulesTable.triggerCount} + 1` })
    .where(eq(botRulesTable.id, rule.id));

  waEvents.emit("new_message", { id: replyId, contactId: jid, contactName, text: replyText, direction: "outbound" });
  await addActivity("auto_reply_sent", `Auto-reply to ${contactName} (rule: ${rule.keyword})`, contactName);
}

// ─── Core socket builder ─────────────────────────────────────────────────────

async function createSocket(state: any, saveCreds: any) {
  const baileys = await import("@whiskeysockets/baileys");
  const makeWASocket: any = baileys.default ?? (baileys as any).makeWASocket;
  const { DisconnectReason, fetchLatestBaileysVersion, Browsers } = baileys as any;

  const { version } = await fetchLatestBaileysVersion();
  const pinoLib = await import("pino");
  const pino: any = pinoLib.default ?? pinoLib;

  const newSock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    browser: Browsers.ubuntu("Chrome"),
    connectTimeoutMs: 30_000,
    retryRequestDelayMs: 2000,
    maxMsgRetryCount: 3,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  newSock.ev.on("creds.update", saveCreds);

  newSock.ev.on("messages.upsert", async ({ messages, type }: any) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      if (msg.key.fromMe || !msg.message) continue;
      const jid = msg.key.remoteJid ?? "";
      if (!jid || jid.includes("@g.us") || jid.includes("@broadcast")) continue;
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption || "";
      if (!text.trim()) continue;
      const pushName = msg.pushName ?? jid.replace("@s.whatsapp.net", "");
      try { await handleIncoming(jid, text, pushName); }
      catch (err) { logger.error({ err }, "Error handling message"); }
    }
  });

  return { newSock, DisconnectReason };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function connectWhatsApp(phoneNumber: string): Promise<{
  code: string;
  expiresAt: string;
  instructions: string;
}> {
  if (sock) {
    try { sock.end(undefined); } catch (_) {}
    sock = null;
  }

  // Use PostgreSQL for auth state — survives restarts on any server
  const { state, saveCreds } = await usePostgresAuthState();
  const { newSock } = await createSocket(state, saveCreds);
  sock = newSock;

  const cleanPhone = phoneNumber.replace(/\D/g, "");

  const code = await new Promise<string>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("Timed out waiting for WhatsApp. Check your number and try again."));
    }, 25_000);

    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      fn();
    };

    const onConnUpdate = (update: any) => {
      if (update.connection === "close" && !settled) {
        const reason = (update.lastDisconnect?.error as any)?.output?.statusCode;
        settle(() => reject(new Error(
          reason === 401
            ? "Unauthorized — use a spare WhatsApp number, not your main one."
            : reason === 403
            ? "Access denied by WhatsApp. Try again in a few minutes."
            : `WhatsApp closed the connection (code ${reason ?? "unknown"}). Verify your number and try again.`
        )));
      }
    };
    sock.ev.on("connection.update", onConnUpdate);

    sock.requestPairingCode(cleanPhone)
      .then((c: string) => {
        sock.ev.off("connection.update", onConnUpdate);
        settle(() => resolve(c));
      })
      .catch((err: any) => {
        sock.ev.off("connection.update", onConnUpdate);
        settle(() => reject(new Error(
          err?.message === "Connection Closed"
            ? "WhatsApp rejected the connection. Make sure your number is correct (with country code) and WhatsApp is updated."
            : err?.message ?? "Failed to get pairing code"
        )));
      });
  });

  await setSessionStatus("connecting");

  sock.ev.on("connection.update", async (update: any) => {
    const { connection, lastDisconnect } = update;
    if (connection === "open") {
      const me = sock?.user;
      const name = me?.name ?? me?.id?.split(":")?.[0] ?? cleanPhone;
      await setSessionStatus("connected", { phoneNumber: cleanPhone, name });
      await addActivity("session_connected", `WhatsApp connected as ${name}`);
      logger.info({ name }, "WhatsApp connected");
    }
    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      logger.info({ statusCode }, "WA connection closed");
      const baileys = await import("@whiskeysockets/baileys");
      const { DisconnectReason } = baileys as any;
      if (statusCode === DisconnectReason?.loggedOut) {
        await setSessionStatus("disconnected", { phoneNumber: null, name: null });
        await addActivity("session_disconnected", "Session logged out");
        await clearAuthState();
        sock = null;
      } else {
        await setSessionStatus("error");
      }
    }
  });

  return {
    code,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    instructions:
      "Open WhatsApp → Settings → Linked Devices → Link a Device → tap 'Link with phone number instead' → enter this code",
  };
}

export async function disconnectWhatsApp() {
  if (sock) {
    try { sock.end(undefined); } catch (_) {}
    sock = null;
  }
  await clearAuthState();
  await setSessionStatus("disconnected", { phoneNumber: null, name: null });
  await addActivity("session_disconnected", "Session disconnected manually");
}

export async function sendMessageToContact(jid: string, text: string) {
  if (!sock) throw new Error("WhatsApp not connected");
  await sock.sendMessage(jid, { text });
}

export async function tryRestoreSession() {
  // Check DB for saved credentials instead of filesystem
  const hasState = await hasAuthState();
  if (!hasState) return;

  logger.info("Restoring WhatsApp session from database...");
  try {
    const { state, saveCreds } = await usePostgresAuthState();
    const { newSock } = await createSocket(state, saveCreds);
    sock = newSock;

    sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect } = update;
      if (connection === "open") {
        const me = sock?.user;
        const name = me?.name ?? me?.id?.split(":")?.[0] ?? "";
        await setSessionStatus("connected", { name });
        logger.info({ name }, "WA session restored from DB");
      }
      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const baileys = await import("@whiskeysockets/baileys");
        const { DisconnectReason } = baileys as any;
        if (statusCode === DisconnectReason?.loggedOut) {
          await setSessionStatus("disconnected", { phoneNumber: null, name: null });
          await clearAuthState();
          sock = null;
        } else {
          await setSessionStatus("connecting");
        }
      }
    });
  } catch (err) {
    logger.error({ err }, "Failed to restore WA session from DB");
  }
}
