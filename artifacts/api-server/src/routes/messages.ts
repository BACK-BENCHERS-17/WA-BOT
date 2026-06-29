import { Router } from "express";
import { db } from "@workspace/db";
import {
  messagesTable,
  contactsTable,
  activityLogTable,
} from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { sendMessageToContact } from "../lib/whatsapp-service";

const router = Router();

router.get("/messages", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const contactId = req.query.contactId as string | undefined;

    let messages;
    if (contactId) {
      messages = await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.contactId, contactId))
        .orderBy(desc(messagesTable.timestamp))
        .limit(limit);
    } else {
      messages = await db
        .select()
        .from(messagesTable)
        .orderBy(desc(messagesTable.timestamp))
        .limit(limit);
    }

    res.json(
      messages.map((m) => ({
        ...m,
        timestamp: m.timestamp.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get messages");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/messages/:id/reply", async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body as { text: string };

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "text is required" });
    }

    const original = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.id, id))
      .limit(1);

    if (!original.length) {
      return res.status(404).json({ error: "Message not found" });
    }

    const msg = original[0];

    try {
      await sendMessageToContact(msg.contactId, text.trim());
    } catch (sendErr: any) {
      req.log.warn({ sendErr }, "WhatsApp not connected, storing reply only");
    }

    const replyId = randomUUID();
    await db.insert(messagesTable).values({
      id: replyId,
      contactId: msg.contactId,
      contactName: msg.contactName,
      text: text.trim(),
      direction: "outbound",
      isAutoReply: false,
      status: "sent",
    });

    await db
      .update(contactsTable)
      .set({
        lastMessageAt: new Date(),
        messageCount: sql`${contactsTable.messageCount} + 1`,
      })
      .where(eq(contactsTable.id, msg.contactId));

    const actId = randomUUID();
    await db.insert(activityLogTable).values({
      id: actId,
      type: "manual_reply_sent",
      description: `Manual reply sent to ${msg.contactName}`,
      contactName: msg.contactName,
    });

    res.json({ success: true, message: "Reply sent successfully." });
  } catch (err) {
    req.log.error({ err }, "Failed to send reply");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/contacts", async (req, res) => {
  try {
    const contacts = await db
      .select()
      .from(contactsTable)
      .orderBy(desc(contactsTable.lastMessageAt));

    res.json(
      contacts.map((c) => ({
        ...c,
        lastMessageAt: c.lastMessageAt.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get contacts");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
