import { Router } from "express";
import { db } from "@workspace/db";
import { botConfigTable, botRulesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

async function getOrCreateConfig() {
  const existing = await db.select().from(botConfigTable).limit(1);
  if (existing.length > 0) return existing[0];
  const [created] = await db.insert(botConfigTable).values({}).returning();
  return created;
}

router.get("/bot/config", async (req, res) => {
  try {
    const config = await getOrCreateConfig();
    res.json({
      enabled: config.enabled,
      businessName: config.businessName,
      gstNumber: config.gstNumber ?? null,
      greeting: config.greeting,
      refundPolicy: config.refundPolicy,
      autoReplyDelay: config.autoReplyDelay,
      workingHoursEnabled: config.workingHoursEnabled,
      workingHoursStart: config.workingHoursStart,
      workingHoursEnd: config.workingHoursEnd,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get bot config");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/bot/config", async (req, res) => {
  try {
    const config = await getOrCreateConfig();
    const body = req.body as Partial<{
      enabled: boolean;
      businessName: string;
      gstNumber: string | null;
      greeting: string;
      refundPolicy: string;
      autoReplyDelay: number;
      workingHoursEnabled: boolean;
      workingHoursStart: string;
      workingHoursEnd: string;
    }>;

    const [updated] = await db
      .update(botConfigTable)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(botConfigTable.id, config.id))
      .returning();

    res.json({
      enabled: updated.enabled,
      businessName: updated.businessName,
      gstNumber: updated.gstNumber ?? null,
      greeting: updated.greeting,
      refundPolicy: updated.refundPolicy,
      autoReplyDelay: updated.autoReplyDelay,
      workingHoursEnabled: updated.workingHoursEnabled,
      workingHoursStart: updated.workingHoursStart,
      workingHoursEnd: updated.workingHoursEnd,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update bot config");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/bot/rules", async (req, res) => {
  try {
    const rules = await db.select().from(botRulesTable);
    res.json(rules);
  } catch (err) {
    req.log.error({ err }, "Failed to get bot rules");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/bot/rules", async (req, res) => {
  try {
    const { keyword, response, enabled = true, matchType = "contains" } = req.body as {
      keyword: string;
      response: string;
      enabled?: boolean;
      matchType?: "exact" | "contains" | "startsWith";
    };

    if (!keyword || !response) {
      return res.status(400).json({ error: "keyword and response are required" });
    }

    const [rule] = await db
      .insert(botRulesTable)
      .values({ keyword, response, enabled, matchType })
      .returning();

    res.status(201).json(rule);
  } catch (err) {
    req.log.error({ err }, "Failed to create bot rule");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/bot/rules/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const { keyword, response, enabled, matchType } = req.body as {
      keyword?: string;
      response?: string;
      enabled?: boolean;
      matchType?: "exact" | "contains" | "startsWith";
    };

    const [updated] = await db
      .update(botRulesTable)
      .set({ keyword, response, enabled, matchType })
      .where(eq(botRulesTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Rule not found" });
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update bot rule");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/bot/rules/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const deleted = await db
      .delete(botRulesTable)
      .where(eq(botRulesTable.id, id))
      .returning();

    if (!deleted.length) return res.status(404).json({ error: "Rule not found" });
    res.json({ success: true, message: "Rule deleted successfully." });
  } catch (err) {
    req.log.error({ err }, "Failed to delete bot rule");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
