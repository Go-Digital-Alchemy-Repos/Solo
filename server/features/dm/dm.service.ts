import { db } from "../../db";
import { dmConversations, dmParticipants, dmMessages, userPresence, users } from "@shared/schema";
import { eq, desc, and, sql, lt, isNull, or, ilike, inArray } from "drizzle-orm";
import { logger } from "../../lib/logger";

export async function getOrCreateDirectConversation(userId1: string, userId2: string) {
  const existing = await db.execute(sql`
    SELECT p1.conversation_id
    FROM dm_participants p1
    JOIN dm_participants p2 ON p1.conversation_id = p2.conversation_id
    JOIN dm_conversations c ON c.id = p1.conversation_id
    WHERE p1.user_id = ${userId1}
      AND p2.user_id = ${userId2}
      AND c.type = 'direct'
    LIMIT 1
  `);

  if (existing.rows && existing.rows.length > 0) {
    return { conversationId: existing.rows[0].conversation_id as string, created: false };
  }

  const [conv] = await db.insert(dmConversations).values({
    type: "direct",
    createdByUserId: userId1,
  }).returning();

  await db.insert(dmParticipants).values([
    { conversationId: conv.id, userId: userId1 },
    { conversationId: conv.id, userId: userId2 },
  ]);

  return { conversationId: conv.id, created: true };
}

export async function getUserConversations(userId: string) {
  const convos = await db.execute(sql`
    SELECT
      c.id,
      c.type,
      c.created_at,
      c.updated_at,
      c.last_message_at,
      c.last_message_preview,
      p.last_read_message_id,
      p.last_read_at,
      p.is_muted,
      (
        SELECT COUNT(*)::int FROM dm_messages m
        WHERE m.conversation_id = c.id
          AND m.deleted_at IS NULL
          AND m.created_at > COALESCE(p.last_read_at, '1970-01-01')
          AND m.sender_id != ${userId}
      ) as unread_count
    FROM dm_participants p
    JOIN dm_conversations c ON c.id = p.conversation_id
    WHERE p.user_id = ${userId}
      AND p.left_at IS NULL
    ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
  `);

  const conversationIds = convos.rows.map((r: any) => r.id) as string[];
  if (conversationIds.length === 0) return [];

  const participants = await db
    .select({
      conversationId: dmParticipants.conversationId,
      userId: dmParticipants.userId,
      username: users.username,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
    })
    .from(dmParticipants)
    .innerJoin(users, eq(users.id, dmParticipants.userId))
    .where(
      and(
        inArray(dmParticipants.conversationId, conversationIds),
        isNull(dmParticipants.leftAt)
      )
    );

  const participantMap = new Map<string, any[]>();
  for (const p of participants) {
    const list = participantMap.get(p.conversationId) || [];
    list.push({
      userId: p.userId,
      username: p.username,
      avatarUrl: p.avatarUrl,
      bio: p.bio,
    });
    participantMap.set(p.conversationId, list);
  }

  return convos.rows.map((c: any) => {
    const allParticipants = participantMap.get(c.id) || [];
    const otherParticipants = allParticipants.filter((p: any) => p.userId !== userId);

    return {
      id: c.id,
      type: c.type,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      lastMessageAt: c.last_message_at,
      lastMessagePreview: c.last_message_preview,
      unreadCount: c.unread_count,
      isMuted: c.is_muted,
      participants: allParticipants,
      otherUser: c.type === "direct" ? otherParticipants[0] || null : null,
    };
  });
}

export async function getConversationMessages(conversationId: string, cursor?: string, limit = 30) {
  let conditions = [
    eq(dmMessages.conversationId, conversationId),
    isNull(dmMessages.deletedAt),
  ];

  if (cursor) {
    conditions.push(lt(dmMessages.createdAt, new Date(cursor)));
  }

  const msgs = await db
    .select({
      id: dmMessages.id,
      conversationId: dmMessages.conversationId,
      senderId: dmMessages.senderId,
      type: dmMessages.type,
      text: dmMessages.text,
      mediaUrl: dmMessages.mediaUrl,
      mediaMeta: dmMessages.mediaMeta,
      clientNonce: dmMessages.clientNonce,
      createdAt: dmMessages.createdAt,
      editedAt: dmMessages.editedAt,
    })
    .from(dmMessages)
    .where(and(...conditions))
    .orderBy(desc(dmMessages.createdAt))
    .limit(limit + 1);

  const hasMore = msgs.length > limit;
  const items = hasMore ? msgs.slice(0, limit) : msgs;
  const nextCursor = hasMore ? items[items.length - 1].createdAt?.toISOString() : null;

  const senderIds = [...new Set(items.map((m) => m.senderId))];
  let senderMap: Record<string, { username: string; avatarUrl: string | null }> = {};

  if (senderIds.length > 0) {
    const senders = await db
      .select({ id: users.id, username: users.username, avatarUrl: users.avatarUrl })
      .from(users)
      .where(sql`${users.id} IN (${sql.join(senderIds.map(id => sql`${id}`), sql`, `)})`);

    for (const s of senders) {
      senderMap[s.id] = { username: s.username || "Unknown", avatarUrl: s.avatarUrl };
    }
  }

  const messagesWithSender = items.map((m) => ({
    ...m,
    sender: senderMap[m.senderId] || { username: "Unknown", avatarUrl: null },
  }));

  return { messages: messagesWithSender, nextCursor, hasMore };
}

export async function sendMessage(opts: {
  conversationId: string;
  senderId: string;
  type: string;
  text?: string;
  mediaUrl?: string;
  mediaMeta?: any;
  clientNonce?: string;
}) {
  if (opts.clientNonce) {
    const [existing] = await db
      .select({ id: dmMessages.id })
      .from(dmMessages)
      .where(
        and(
          eq(dmMessages.conversationId, opts.conversationId),
          eq(dmMessages.clientNonce, opts.clientNonce)
        )
      )
      .limit(1);

    if (existing) {
      const [full] = await db.select().from(dmMessages).where(eq(dmMessages.id, existing.id));
      return { message: full, duplicate: true };
    }
  }

  const [message] = await db.insert(dmMessages).values({
    conversationId: opts.conversationId,
    senderId: opts.senderId,
    type: opts.type || "text",
    text: opts.text || null,
    mediaUrl: opts.mediaUrl || null,
    mediaMeta: opts.mediaMeta || null,
    clientNonce: opts.clientNonce || null,
  }).returning();

  const preview = opts.type === "text"
    ? (opts.text || "").slice(0, 100)
    : opts.type === "image"
      ? "Sent an image"
      : "Sent a message";

  await db.update(dmConversations).set({
    lastMessageAt: message.createdAt,
    lastMessagePreview: preview,
    updatedAt: new Date(),
  }).where(eq(dmConversations.id, opts.conversationId));

  const sender = await db
    .select({ username: users.username, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, opts.senderId))
    .limit(1);

  return {
    message: {
      ...message,
      sender: sender[0] || { username: "Unknown", avatarUrl: null },
    },
    duplicate: false,
  };
}

export async function isParticipant(conversationId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ conversationId: dmParticipants.conversationId })
    .from(dmParticipants)
    .where(
      and(
        eq(dmParticipants.conversationId, conversationId),
        eq(dmParticipants.userId, userId),
        isNull(dmParticipants.leftAt)
      )
    )
    .limit(1);
  return !!row;
}

export async function markRead(conversationId: string, userId: string, messageId: string) {
  await db
    .update(dmParticipants)
    .set({
      lastReadMessageId: messageId,
      lastReadAt: new Date(),
    })
    .where(
      and(
        eq(dmParticipants.conversationId, conversationId),
        eq(dmParticipants.userId, userId)
      )
    );
}

export async function deleteMessage(messageId: string, userId: string) {
  const [msg] = await db.select().from(dmMessages).where(eq(dmMessages.id, messageId)).limit(1);
  if (!msg) return { error: "NOT_FOUND" };
  if (msg.senderId !== userId) return { error: "FORBIDDEN" };

  await db.update(dmMessages).set({ deletedAt: new Date() }).where(eq(dmMessages.id, messageId));
  return { ok: true, conversationId: msg.conversationId };
}

export async function getConversationParticipantIds(conversationId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: dmParticipants.userId })
    .from(dmParticipants)
    .where(
      and(
        eq(dmParticipants.conversationId, conversationId),
        isNull(dmParticipants.leftAt)
      )
    );
  return rows.map((r) => r.userId);
}

export async function searchUsers(query: string, currentUserId: string, limit = 20) {
  if (!query || query.length < 2) return [];

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
    })
    .from(users)
    .where(
      and(
        or(
          ilike(users.username, `%${query}%`),
          ilike(users.email, `%${query}%`)
        ),
        sql`${users.id} != ${currentUserId}`,
        eq(users.isDisabled, false)
      )
    )
    .limit(limit);

  return rows;
}

export async function updatePresence(userId: string, status: "online" | "offline") {
  await db.execute(sql`
    INSERT INTO user_presence (user_id, status, last_seen_at, updated_at)
    VALUES (${userId}, ${status}, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      status = ${status},
      last_seen_at = CASE WHEN ${status} = 'offline' THEN NOW() ELSE user_presence.last_seen_at END,
      updated_at = NOW()
  `);
}

export async function getPresence(userIds: string[]) {
  if (userIds.length === 0) return {};
  const rows = await db
    .select()
    .from(userPresence)
    .where(sql`${userPresence.userId} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`);

  const result: Record<string, { status: string; lastSeenAt: string }> = {};
  for (const row of rows) {
    result[row.userId] = {
      status: row.status,
      lastSeenAt: row.lastSeenAt?.toISOString() || new Date().toISOString(),
    };
  }
  return result;
}
