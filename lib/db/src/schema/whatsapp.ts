import { pgTable, text, serial, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const messageDirectionEnum = pgEnum("message_direction", ["inbound", "outbound"]);
export const messageStatusEnum = pgEnum("message_status", ["received", "sent", "delivered", "read"]);
export const matchTypeEnum = pgEnum("match_type", ["exact", "contains", "startsWith"]);
export const sessionStatusEnum = pgEnum("session_status_type", ["disconnected", "connecting", "connected", "error"]);

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  connected: boolean("connected").notNull().default(false),
  phoneNumber: text("phone_number"),
  name: text("name"),
  status: sessionStatusEnum("status").notNull().default("disconnected"),
  pairingCode: text("pairing_code"),
  pairingCodeExpiresAt: timestamp("pairing_code_expires_at"),
  lastSeen: timestamp("last_seen"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const contactsTable = pgTable("contacts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  messageCount: integer("message_count").notNull().default(0),
  unreadCount: integer("unread_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messagesTable = pgTable("messages", {
  id: text("id").primaryKey(),
  contactId: text("contact_id").notNull().references(() => contactsTable.id),
  contactName: text("contact_name").notNull(),
  text: text("text").notNull(),
  direction: messageDirectionEnum("direction").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  isAutoReply: boolean("is_auto_reply").notNull().default(false),
  status: messageStatusEnum("status").notNull().default("received"),
});

export const botConfigTable = pgTable("bot_config", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  businessName: text("business_name").notNull().default("My Business"),
  gstNumber: text("gst_number"),
  greeting: text("greeting").notNull().default("Hi {name}! Thanks for reaching out. What can I help you with today?"),
  refundPolicy: text("refund_policy").notNull().default("7-day money-back guarantee, no questions asked."),
  autoReplyDelay: integer("auto_reply_delay").notNull().default(1),
  workingHoursEnabled: boolean("working_hours_enabled").notNull().default(false),
  workingHoursStart: text("working_hours_start").notNull().default("09:00"),
  workingHoursEnd: text("working_hours_end").notNull().default("18:00"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const botRulesTable = pgTable("bot_rules", {
  id: serial("id").primaryKey(),
  keyword: text("keyword").notNull(),
  response: text("response").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  matchType: matchTypeEnum("match_type").notNull().default("contains"),
  triggerCount: integer("trigger_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const activityLogTable = pgTable("activity_log", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  contactName: text("contact_name"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const waAuthStateTable = pgTable("wa_auth_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertContactSchema = createInsertSchema(contactsTable);
export const insertMessageSchema = createInsertSchema(messagesTable);
export const insertBotRuleSchema = createInsertSchema(botRulesTable).omit({ id: true, triggerCount: true, createdAt: true });
export const insertBotConfigSchema = createInsertSchema(botConfigTable).omit({ id: true, updatedAt: true });

export type Session = typeof sessionsTable.$inferSelect;
export type Contact = typeof contactsTable.$inferSelect;
export type Message = typeof messagesTable.$inferSelect;
export type BotConfig = typeof botConfigTable.$inferSelect;
export type BotRule = typeof botRulesTable.$inferSelect;
export type ActivityLog = typeof activityLogTable.$inferSelect;
