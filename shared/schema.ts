import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, serial, boolean, index, customType } from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  username: text("username").unique(),
  avatarUrl: text("avatar_url"),
  bio: text("bio").default(""),
  isAdmin: boolean("is_admin").default(false).notNull(),
  role: text("role").default("user").notNull(),
  isDisabled: boolean("is_disabled").default(false).notNull(),
  disabledAt: timestamp("disabled_at"),
  disabledReason: text("disabled_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const baUser = pgTable("ba_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").default("user"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const baSession = pgTable("ba_session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => baUser.id, { onDelete: "cascade" }),
});

export const baAccount = pgTable("ba_account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => baUser.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const baVerification = pgTable("ba_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const appDocs = pgTable("app_docs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  category: text("category").notNull().default("General"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const soloStatus = ['queued', 'processing', 'ready', 'failed'] as const;
export type SoloStatus = typeof soloStatus[number];

export const soloProcessingStep = ['upload', 'trim', 'mix', 'transcribe', 'done'] as const;
export type SoloProcessingStep = typeof soloProcessingStep[number];

export const solos = pgTable("solos", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  username: text("username").notNull(),
  audioUrl: text("audio_url").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  avatarUrl: text("avatar_url"),
  title: text("title").notNull().default('Untitled Solo'),
  durationMs: integer("duration_ms").notNull().default(0),
  displayName: text("display_name"),
  transcript: jsonb("transcript"),
  status: text("status").notNull().default('ready'),
  processingStep: text("processing_step").notNull().default('done'),
  processingError: text("processing_error"),
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  readyAt: timestamp("ready_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  searchText: text("search_text"),
  searchVector: tsvector("search_vector"),
}, (table) => [
  index("solos_status_updated_idx").on(table.status, table.updatedAt),
  index("solos_created_at_idx").on(table.timestamp),
]);

export const systemIntegrations = pgTable("system_integrations", {
  id: serial("id").primaryKey(),
  service: text("service").notNull().unique(),
  config: jsonb("config").notNull().default({}),
  enabled: boolean("enabled").notNull().default(false),
  lastTestedAt: timestamp("last_tested_at"),
  lastTestResult: text("last_test_result"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const eventLevel = ['info', 'warn', 'error'] as const;
export type EventLevel = typeof eventLevel[number];

export const systemEvents = pgTable("system_events", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  level: text("level").notNull().default('info'),
  source: text("source").notNull(),
  eventType: text("event_type").notNull(),
  message: text("message").notNull(),
  details: jsonb("details"),
  requestId: text("request_id"),
  userId: text("user_id"),
  soloId: text("solo_id"),
  resolvedAt: timestamp("resolved_at"),
  resolvedByUserId: text("resolved_by_user_id"),
  resolutionNote: text("resolution_note"),
}, (table) => [
  index("system_events_created_idx").on(table.createdAt),
  index("system_events_level_idx").on(table.level),
  index("system_events_source_idx").on(table.source),
  index("system_events_resolved_idx").on(table.resolvedAt),
]);

export const requestLogs = pgTable("request_logs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  requestId: text("request_id").notNull(),
  method: text("method").notNull(),
  path: text("path").notNull(),
  status: integer("status").notNull(),
  durationMs: integer("duration_ms"),
  userId: text("user_id"),
  ip: text("ip"),
  userAgent: text("user_agent"),
}, (table) => [
  index("request_logs_created_idx").on(table.createdAt),
  index("request_logs_status_idx").on(table.status),
  index("request_logs_path_idx").on(table.path),
]);

export type SystemEvent = typeof systemEvents.$inferSelect;
export type RequestLog = typeof requestLogs.$inferSelect;

export const userPasswordResets = pgTable("user_password_resets", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdByAdminId: varchar("created_by_admin_id"),
}, (table) => [
  index("password_resets_user_idx").on(table.userId),
  index("password_resets_expires_idx").on(table.expiresAt),
]);

export const adminAuditLog = pgTable("admin_audit_log", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  adminUserId: varchar("admin_user_id").notNull(),
  action: text("action").notNull(),
  targetUserId: varchar("target_user_id"),
  details: jsonb("details"),
}, (table) => [
  index("audit_log_created_idx").on(table.createdAt),
  index("audit_log_action_idx").on(table.action),
  index("audit_log_target_idx").on(table.targetUserId),
]);

export type UserPasswordReset = typeof userPasswordResets.$inferSelect;
export type AdminAuditLogEntry = typeof adminAuditLog.$inferSelect;

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const dmConversations = pgTable("dm_conversations", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  type: text("type").notNull().default("direct"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastMessageAt: timestamp("last_message_at"),
  lastMessagePreview: text("last_message_preview"),
  createdByUserId: varchar("created_by_user_id").notNull(),
});

export const dmParticipants = pgTable("dm_participants", {
  conversationId: varchar("conversation_id").notNull().references(() => dmConversations.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  role: text("role").notNull().default("member"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  leftAt: timestamp("left_at"),
  isMuted: boolean("is_muted").default(false).notNull(),
  lastReadMessageId: varchar("last_read_message_id"),
  lastReadAt: timestamp("last_read_at"),
}, (table) => [
  index("dm_participants_user_idx").on(table.userId, table.conversationId),
  index("dm_participants_conv_idx").on(table.conversationId),
]);

export const dmMessages = pgTable("dm_messages", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => dmConversations.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id").notNull(),
  type: text("type").notNull().default("text"),
  text: text("text"),
  mediaUrl: text("media_url"),
  mediaMeta: jsonb("media_meta"),
  clientNonce: text("client_nonce"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  editedAt: timestamp("edited_at"),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("dm_messages_conv_created_idx").on(table.conversationId, table.createdAt),
  index("dm_messages_sender_idx").on(table.senderId),
  index("dm_messages_nonce_idx").on(table.conversationId, table.clientNonce),
]);

export const userPresence = pgTable("user_presence", {
  userId: varchar("user_id").primaryKey(),
  status: text("status").notNull().default("offline"),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type DmConversation = typeof dmConversations.$inferSelect;
export type DmParticipant = typeof dmParticipants.$inferSelect;
export type DmMessage = typeof dmMessages.$inferSelect;
export type UserPresence = typeof userPresence.$inferSelect;

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  passwordHash: true,
});

export const insertSoloSchema = createInsertSchema(solos).pick({
  userId: true,
  username: true,
  audioUrl: true,
  tags: true,
  avatarUrl: true,
  title: true,
  durationMs: true,
  displayName: true,
  transcript: true,
  status: true,
  processingStep: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Solo = typeof solos.$inferSelect;
export type InsertSolo = z.infer<typeof insertSoloSchema>;

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface Transcript {
  text: string;
  words: TranscriptWord[];
}
