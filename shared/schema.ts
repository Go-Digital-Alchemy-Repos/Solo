import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const solos = pgTable("solos", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull(),
  audioUrl: text("audio_url").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  avatarUrl: text("avatar_url"),
  title: text("title").notNull().default('Untitled Solo'),
  durationMs: integer("duration_ms").notNull().default(0),
  displayName: text("display_name"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertSoloSchema = createInsertSchema(solos).pick({
  username: true,
  audioUrl: true,
  tags: true,
  avatarUrl: true,
  title: true,
  durationMs: true,
  displayName: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Solo = typeof solos.$inferSelect;
export type InsertSolo = z.infer<typeof insertSoloSchema>;
