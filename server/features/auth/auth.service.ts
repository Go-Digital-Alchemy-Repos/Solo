import bcrypt from "bcryptjs";
import { db } from "../../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { AVATARS_DIR } from "../../utils/paths";

export async function findUserByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user || null;
}

export async function findUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user || null;
}

export async function createUser(email: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(users).values({
    email,
    passwordHash,
  }).returning();
  return user;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function updateProfile(userId: string, updates: Record<string, unknown>) {
  const [updated] = await db.update(users)
    .set(updates)
    .where(eq(users.id, userId))
    .returning();
  return updated;
}

export async function checkUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean> {
  const existing = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (existing.length === 0) return true;
  if (excludeUserId && existing[0].id === excludeUserId) return true;
  return false;
}

export function saveAvatarFile(fileBuffer: Buffer, mimetype: string): string {
  const fileId = randomUUID();
  const ext = mimetype.includes("png") ? "png" : "jpg";
  const fileName = `${fileId}.${ext}`;
  const filePath = path.join(AVATARS_DIR, fileName);
  fs.writeFileSync(filePath, fileBuffer);
  return `/api/avatars/${fileId}.${ext}`;
}
