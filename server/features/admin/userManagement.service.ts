import { db } from "../../db";
import { users, solos, userPasswordResets, adminAuditLog } from "@shared/schema";
import { eq, desc, sql, count, and, gt, isNull, or, ilike } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { logger } from "../../lib/logger";

const PASSWORD_MIN_LENGTH = 8;
const RESET_TOKEN_EXPIRY_MINUTES = 60;

export async function listUsersAdvanced(opts: {
  query?: string;
  role?: string;
  status?: string;
  limit: number;
  cursor?: string;
}) {
  const { query, role, status, limit, cursor } = opts;
  const conditions: any[] = [];

  if (query) {
    conditions.push(
      or(
        ilike(users.email, `%${query}%`),
        ilike(users.username, `%${query}%`)
      )
    );
  }

  if (role === "admin") {
    conditions.push(eq(users.isAdmin, true));
  } else if (role === "user") {
    conditions.push(eq(users.isAdmin, false));
  }

  if (status === "active") {
    conditions.push(eq(users.isDisabled, false));
  } else if (status === "disabled") {
    conditions.push(eq(users.isDisabled, true));
  }

  if (cursor) {
    conditions.push(sql`${users.createdAt} < ${cursor}`);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      isAdmin: users.isAdmin,
      role: users.role,
      isDisabled: users.isDisabled,
      disabledAt: users.disabledAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(whereClause)
    .orderBy(desc(users.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].createdAt?.toISOString() : null;

  const userIds = items.map((u) => u.id);
  let soloCounts: Record<string, number> = {};
  if (userIds.length > 0) {
    const counts = await db
      .select({ userId: solos.userId, count: count() })
      .from(solos)
      .where(sql`${solos.userId} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`)
      .groupBy(solos.userId);
    for (const row of counts) {
      soloCounts[row.userId] = Number(row.count);
    }
  }

  const usersWithCounts = items.map((u) => ({
    ...u,
    soloCount: soloCounts[u.id] || 0,
  }));

  return { users: usersWithCounts, nextCursor, hasMore };
}

export async function getUserDetails(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      isAdmin: users.isAdmin,
      role: users.role,
      isDisabled: users.isDisabled,
      disabledAt: users.disabledAt,
      disabledReason: users.disabledReason,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return null;

  const [soloCount] = await db
    .select({ count: count() })
    .from(solos)
    .where(eq(solos.userId, userId));

  const recentAudit = await db
    .select()
    .from(adminAuditLog)
    .where(eq(adminAuditLog.targetUserId, userId))
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(10);

  return {
    ...user,
    soloCount: soloCount?.count || 0,
    recentAudit,
  };
}

export async function createUser(opts: {
  email: string;
  username?: string;
  tempPassword?: string;
  role?: string;
  adminId: string;
}) {
  const { email, username, tempPassword, role, adminId } = opts;

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return { error: "EMAIL_EXISTS" };
  }

  if (username) {
    const existingUsername = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
    if (existingUsername.length > 0) {
      return { error: "USERNAME_EXISTS" };
    }
  }

  const password = tempPassword || crypto.randomBytes(16).toString("hex");
  const passwordHash = await bcrypt.hash(password, 12);
  const isAdmin = role === "admin";

  const [newUser] = await db
    .insert(users)
    .values({
      email,
      username: username || null,
      passwordHash,
      isAdmin,
      role: isAdmin ? "admin" : "user",
    })
    .returning({
      id: users.id,
      email: users.email,
      username: users.username,
      isAdmin: users.isAdmin,
      createdAt: users.createdAt,
    });

  await writeAuditLog(adminId, "USER_CREATE", newUser.id, {
    email,
    username: username || null,
    role: isAdmin ? "admin" : "user",
    hadTempPassword: !!tempPassword,
  });

  return { user: newUser };
}

export async function generateResetToken(userId: string, adminId: string) {
  const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { error: "USER_NOT_FOUND" };

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);

  await db.insert(userPasswordResets).values({
    userId,
    tokenHash,
    expiresAt,
    createdByAdminId: adminId,
  });

  await writeAuditLog(adminId, "USER_RESET_LINK_SENT", userId, {
    expiresAt: expiresAt.toISOString(),
    delivery: "manual",
  });

  return { token, userId, expiresAt };
}

export async function setPassword(userId: string, newPassword: string, forceLogout: boolean, adminId: string) {
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return { error: "PASSWORD_TOO_SHORT" };
  }

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { error: "USER_NOT_FOUND" };

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));

  if (forceLogout) {
    await invalidateUserSessions(userId);
  }

  await writeAuditLog(adminId, "USER_PASSWORD_SET", userId, {
    forceLogout,
  });

  return { ok: true };
}

export async function changeRole(userId: string, newRole: string, adminId: string) {
  const isAdmin = newRole === "admin";

  if (!isAdmin && userId === adminId) {
    const [adminCount] = await db
      .select({ count: count() })
      .from(users)
      .where(eq(users.isAdmin, true));
    if (Number(adminCount.count) <= 1) {
      return { error: "LAST_ADMIN" };
    }
  }

  const [user] = await db.select({ id: users.id, isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { error: "USER_NOT_FOUND" };

  const oldRole = user.isAdmin ? "admin" : "user";

  await db.update(users).set({
    isAdmin,
    role: isAdmin ? "admin" : "user",
  }).where(eq(users.id, userId));

  await writeAuditLog(adminId, "USER_ROLE_CHANGED", userId, {
    from: oldRole,
    to: newRole,
  });

  return { ok: true, from: oldRole, to: newRole };
}

export async function setUserStatus(userId: string, isDisabled: boolean, reason: string | undefined, adminId: string) {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { error: "USER_NOT_FOUND" };

  if (userId === adminId) {
    return { error: "CANNOT_DISABLE_SELF" };
  }

  const updates: any = {
    isDisabled,
    disabledAt: isDisabled ? new Date() : null,
    disabledReason: isDisabled ? (reason || null) : null,
  };

  await db.update(users).set(updates).where(eq(users.id, userId));

  if (isDisabled) {
    await invalidateUserSessions(userId);
  }

  await writeAuditLog(adminId, isDisabled ? "USER_DISABLED" : "USER_ENABLED", userId, {
    reason: reason || null,
  });

  return { ok: true };
}

export async function getUserAuditLog(targetUserId: string, limit: number, cursor?: string) {
  const conditions: any[] = [eq(adminAuditLog.targetUserId, targetUserId)];
  if (cursor) {
    conditions.push(sql`${adminAuditLog.createdAt} < ${cursor}`);
  }

  const rows = await db
    .select()
    .from(adminAuditLog)
    .where(and(...conditions))
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].createdAt?.toISOString() : null;

  return { entries: items, nextCursor, hasMore };
}

export async function verifyResetToken(userId: string, token: string) {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const [resetRow] = await db
    .select()
    .from(userPasswordResets)
    .where(
      and(
        eq(userPasswordResets.userId, userId),
        eq(userPasswordResets.tokenHash, tokenHash),
        isNull(userPasswordResets.usedAt),
        gt(userPasswordResets.expiresAt, new Date())
      )
    )
    .limit(1);

  return resetRow || null;
}

export async function consumeResetToken(resetId: string) {
  await db
    .update(userPasswordResets)
    .set({ usedAt: new Date() })
    .where(eq(userPasswordResets.id, resetId));
}

export async function resetPasswordWithToken(userId: string, token: string, newPassword: string) {
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return { error: "PASSWORD_TOO_SHORT" };
  }

  const resetRow = await verifyResetToken(userId, token);
  if (!resetRow) {
    return { error: "INVALID_OR_EXPIRED_TOKEN" };
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  await consumeResetToken(resetRow.id);
  await invalidateUserSessions(userId);

  return { ok: true };
}

async function invalidateUserSessions(userId: string) {
  try {
    await db.execute(sql`DELETE FROM session WHERE sess->>'userId' = ${userId}`);
  } catch (err) {
    logger.warn("Failed to invalidate sessions", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function writeAuditLog(
  adminUserId: string,
  action: string,
  targetUserId: string | null,
  details?: Record<string, unknown>
) {
  try {
    await db.insert(adminAuditLog).values({
      adminUserId,
      action,
      targetUserId,
      details: details || null,
    });
  } catch (err) {
    logger.error("Failed to write audit log", {
      error: err instanceof Error ? err.message : String(err),
      action,
      targetUserId,
    });
  }
}
