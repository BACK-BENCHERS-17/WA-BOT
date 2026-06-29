import { EventEmitter } from "events";
import path from "path";
import fs from "fs";
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
import { randomUUID } from "crypto";
import { logger } from "./logger";

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const SESSION_DIR = path.resolve(workspaceRoot, "artifacts/api-server/wa-session");

export const waEvents = new EventEmitter();
waEvents.setMaxListeners(100);

type WASocket = any;

let sock: WASocket | null = null;
let isConnecting = false;

async function getOrCreateSession() {
  const existing = await db.select().from(sessionsTable).limit(1);
  if (existing.length > 0) return existing[0];
  const [created] = await db.insert(sessionsTable).values({}).returning();
  return created;
}

async function updateSessionStatus(
  status: "disconnected" | "connecting" | "connected" | "error",
  extra: { phoneNumber?: string | null; name?: string | null } = {}
) {
  const session = await getOrCreateSession();
  await db.update(sessionsTable).set({
    status,
    connected: status === "connected",
    ...extra,
    updatedAt: new Date(),
  }).where(eq(sessionsTable.id, session.id));
  waEvents.emit("session_update", { status, ...extra });
}

async function logActivity(
  type: string,
  description: string,
  contactName?: string
) {
  await db.insert(activityLogTable).values({
    id: randomUUID(),
    type,
    description,
    contactName: contactName ?? null,
  });
  waEvents.emit("activity", { type, description, contactName });
}

async function upsertContact(jid: string, name: string, phoneNumber: string) {
  const existing = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.id, jid))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(contactsTable).values({
      id: jid,
      name,
      phoneNumber,
      lastMessageAt: new Date(),
      messageCount: 1,
      unreadCount: 1,
    });
  } else {
    await db.update(contactsTable).set({
      lastMessageAt: new Date(),
      messageCount: sql`${contactsTable.messageCount} + 1`,
      unreadCount: sql`${contactsTable.unreadCount} + 1`,
    }).where(eq(contactsTable.id, jid));
  }
}

async function findMatchingRule(text: string) {
  const rules = await db
    .select()
    .from(botRulesTable)
    .where(eq(botRulesTable.enabled, true));

  const lower = text.toLowerCase();
  for (const rule of rules) {
    const kw = rule.keyword.toLowerCase();
    if (rule.matchType === "exact" && lower === kw) return rule;
    if (rule.matchType === "contains" && lower.includes(kw)) return rule;
    if (rule.matchType === "startsWith" && lower.startsWith(kw)) return rule;
  }
  return null;
}

async function handleIncomingMessage(jid: string, text: string, pushName: string) {
  const phoneNumber = jid.replace("@s.whatsapp.net", "");
  const contactName = pushName || phoneNumber;
  const msgId = randomUUID();

  await upsertContact(jid, contactName, phoneNumber);

  await db.insert(messagesTable).values({
    id: msgId,
    contactId: jid,
    contactName,
    text,
    direction: "inbound",
    isAutoReply: false,
    status: "received",
  });

  waEvents.emit("new_message", { id: msgId, contactId: jid, contactName, text, direction: "inbound" });

  await logActivity("message_received", `New message from ${contactName}`, contactName);

  const configs = await db.select().from(botConfigTable).limit(1);
  const config = configs[0];
  if (!config?.enabled) return;

  const rule = await findMatchingRule(text);
  if (!rule) return;

  const delay = (config.autoReplyDelay ?? 1) * 1000;
  await new Promise((r) => setTimeout(r, delay));

  const replyText = rule.response
    .replace("{name}", contactName)
    .replace("{business}", config.businessName);

  if (sock) {
    try {
      await sock.sendMessage(jid, { text: replyText });
    } catch (err) {
      logger.error({ err }, "Failed to send auto-reply via WA");
      return;
    }
  }

  const replyId = randomUUID();
  await db.insert(messagesTable).values({
    id: replyId,
    contactId: jid,
    contactName,
    text: replyText,
    direction: "outbound",
    isAutoReply: true,
    status: "sent",
  });

  await db.update(botRulesTable)
    .set({ triggerCount: sql`${botRulesTable.triggerCount} + 1` })
    .where(eq(botRulesTable.id, rule.id));

  waEvents.emit("new_message", { id: replyId, contactId: jid, contactName, text: replyText, direction: "outbound" });
  await logActivity("auto_reply_sent", `Auto-reply sent to ${contactName} (${rule.keyword} rule)`, contactName);
}

export async function connectWhatsApp(phoneNumber: string): Promise<{ code: string; expiresAt: string; instructions: string }> {
  if (isConnecting) {
    throw new Error("Already connecting. Please wait.");
  }

  if (sock) {
    try { sock.end(); } catch (_) {}
    sock = null;
  }

  isConnecting = true;
  fs.mkdirSync(SESSION_DIR, { recursive: true });

  try {
    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } =
      await import("@whiskeysockets/baileys");
    const { Boom } = await import("@hapi/boom");

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: (await import("pino")).default({ level: "silent" }),
      browser: ["WA Bot Dashboard", "Chrome", "1.0.0"],
    });

    sock.ev.on("creds.update", saveCreds);

    const cleanPhone = phoneNumber.replace(/\D/g, "");
    const pairingCode = await sock.requestPairingCode(cleanPhone);
    await updateSessionStatus("connecting", {});

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        isConnecting = false;
        const me = sock?.user;
        const name = me?.name ?? me?.id?.split(":")[0] ?? cleanPhone;
        await updateSessionStatus("connected", {
          phoneNumber: cleanPhone,
          name,
        });
        await logActivity("session_connected", `WhatsApp connected as ${name}`);
        logger.info({ name }, "WhatsApp connected");
      }

      if (connection === "close") {
        isConnecting = false;
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (statusCode === DisconnectReason.loggedOut) {
          await updateSessionStatus("disconnected", { phoneNumber: null, name: null });
          await logActivity("session_disconnected", "WhatsApp session logged out");
          fs.rmSync(SESSION_DIR, { recursive: true, force: true });
          sock = null;
        } else if (shouldReconnect) {
          logger.info("Reconnecting WhatsApp...");
          await updateSessionStatus("connecting", {});
        } else {
          await updateSessionStatus("error", {});
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }: any) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        if (!msg.message) continue;

        const jid = msg.key.remoteJid;
        if (!jid || jid.includes("@g.us")) continue;

        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          "";

        if (!text) continue;

        const pushName = msg.pushName ?? jid.replace("@s.whatsapp.net", "");

        try {
          await handleIncomingMessage(jid, text, pushName);
        } catch (err) {
          logger.error({ err }, "Error handling incoming message");
        }
      }
    });

    isConnecting = false;

    return {
      code: pairingCode,
      expiresAt,
      instructions: "Open WhatsApp > Settings > Linked Devices > Link a Device > Enter Code",
    };
  } catch (err) {
    isConnecting = false;
    await updateSessionStatus("error", {});
    throw err;
  }
}

export async function disconnectWhatsApp() {
  if (sock) {
    try { sock.end(); } catch (_) {}
    sock = null;
  }
  fs.rmSync(SESSION_DIR, { recursive: true, force: true });
  await updateSessionStatus("disconnected", { phoneNumber: null, name: null });
  await logActivity("session_disconnected", "WhatsApp session disconnected manually");
}

export async function sendMessageToContact(jid: string, text: string): Promise<void> {
  if (!sock) throw new Error("WhatsApp not connected");
  await sock.sendMessage(jid, { text });
}

export async function tryRestoreSession() {
  if (!fs.existsSync(SESSION_DIR)) return;
  const files = fs.readdirSync(SESSION_DIR);
  if (files.length === 0) return;

  logger.info("Restoring WhatsApp session from disk...");

  try {
    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } =
      await import("@whiskeysockets/baileys");

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: (await import("pino")).default({ level: "silent" }),
      browser: ["WA Bot Dashboard", "Chrome", "1.0.0"],
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect } = update;
      if (connection === "open") {
        const me = sock?.user;
        const name = me?.name ?? me?.id?.split(":")[0] ?? "";
        await updateSessionStatus("connected", { name });
        logger.info({ name }, "WhatsApp session restored");
      }
      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          await updateSessionStatus("disconnected", { phoneNumber: null, name: null });
          fs.rmSync(SESSION_DIR, { recursive: true, force: true });
          sock = null;
        } else {
          await updateSessionStatus("connecting", {});
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }: any) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        if (!msg.message) continue;
        const jid = msg.key.remoteJid;
        if (!jid || jid.includes("@g.us")) continue;
        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          "";
        if (!text) continue;
        const pushName = msg.pushName ?? jid.replace("@s.whatsapp.net", "");
        try { await handleIncomingMessage(jid, text, pushName); } catch (_) {}
      }
    });
  } catch (err) {
    logger.error({ err }, "Failed to restore WhatsApp session");
  }
}
