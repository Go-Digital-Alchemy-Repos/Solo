import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, serial, boolean, index } from "drizzle-orm/pg-core";
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
}, (table) => [
  index("solos_status_updated_idx").on(table.status, table.updatedAt),
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
