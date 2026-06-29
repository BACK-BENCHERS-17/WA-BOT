import { Router } from "express";
import { db } from "@workspace/db";
import {
  messagesTable,
  contactsTable,
  botConfigTable,
  sessionsTable,
  activityLogTable,
} from "@workspace/db";
import { eq, and, gte, desc, count, sql } from "drizzle-orm";

const router = Router();

router.get("/stats/summary", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalResult] = await db
      .select({ count: count() })
      .from(messagesTable);

    const [inboundTodayResult] = await db
      .select({ count: count() })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.direction, "inbound"),
          gte(messagesTable.timestamp, today)
        )
      );

    const [autoRepliedTodayResult] = await db
      .select({ count: count() })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.isAutoReply, true),
          gte(messagesTable.timestamp, today)
        )
      );

    const [activeContactsResult] = await db
      .select({ count: count() })
      .from(contactsTable);

    const sessions = await db.select().from(sessionsTable).limit(1);
    const session = sessions[0];

    const botConfigs = await db.select().from(botConfigTable).limit(1);
    const botConfig = botConfigs[0];

    const totalMessages = Number(totalResult?.count ?? 0);
    const inboundToday = Number(inboundTodayResult?.count ?? 0);
    const autoRepliedToday = Number(autoRepliedTodayResult?.count ?? 0);
    const activeContacts = Number(activeContactsResult?.count ?? 0);
    const responseRate =
      inboundToday > 0
        ? Math.round((autoRepliedToday / inboundToday) * 100)
        : 0;

    res.json({
      totalMessages,
      inboundToday,
      autoRepliedToday,
      activeContacts,
      botEnabled: botConfig?.enabled ?? false,
      sessionConnected: session?.connected ?? false,
      responseRate,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get stats summary");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/stats/activity", async (req, res) => {
  try {
    const activities = await db
      .select()
      .from(activityLogTable)
      .orderBy(desc(activityLogTable.timestamp))
      .limit(30);

    res.json(
      activities.map((a) => ({
        id: a.id,
        type: a.type,
        description: a.description,
        contactName: a.contactName ?? null,
        timestamp: a.timestamp.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get activity feed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
