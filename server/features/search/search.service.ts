import { db } from "../../db";
import { solos, users } from "@shared/schema";
import { eq, sql, and, desc, or, ilike } from "drizzle-orm";

interface TranscriptData {
  text?: string;
  words?: { word: string }[];
}

export function buildSoloSearchText(solo: {
  title: string;
  username: string;
  displayName?: string | null;
  tags?: string[] | null;
  transcript?: TranscriptData | null;
}): string {
  const parts: string[] = [];

  if (solo.title) parts.push(solo.title);
  if (solo.username) parts.push(solo.username);
  if (solo.displayName) parts.push(solo.displayName);
  if (solo.tags?.length) parts.push(solo.tags.join(' '));

  if (solo.transcript && typeof solo.transcript === 'object') {
    const t = solo.transcript as TranscriptData;
    if (t.text) parts.push(t.text);
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export async function updateSoloSearchFields(soloId: string) {
  const [solo] = await db.select().from(solos).where(eq(solos.id, soloId)).limit(1);
  if (!solo) return;

  const searchText = buildSoloSearchText({
    title: solo.title,
    username: solo.username,
    displayName: solo.displayName,
    tags: solo.tags,
    transcript: solo.transcript as TranscriptData | null,
  });

  await db.update(solos).set({
    searchText,
    searchVector: sql`to_tsvector('english', unaccent(${searchText}))`,
  }).where(eq(solos.id, soloId));
}

export async function backfillSearchFields() {
  const allSolos = await db.select({
    id: solos.id,
    title: solos.title,
    username: solos.username,
    displayName: solos.displayName,
    tags: solos.tags,
    transcript: solos.transcript,
  }).from(solos);

  let count = 0;
  for (const solo of allSolos) {
    const searchText = buildSoloSearchText({
      title: solo.title,
      username: solo.username,
      displayName: solo.displayName,
      tags: solo.tags,
      transcript: solo.transcript as TranscriptData | null,
    });

    await db.update(solos).set({
      searchText,
      searchVector: sql`to_tsvector('english', unaccent(${searchText}))`,
    }).where(eq(solos.id, solo.id));
    count++;
  }

  return count;
}

export async function searchSolos(query: string, limit = 20, offset = 0) {
  const sanitized = query.replace(/[^\w\s]/g, '').trim();
  if (!sanitized) return { results: [], total: 0 };

  const tsQuery = sanitized.split(/\s+/).filter(Boolean).map(w => `${w}:*`).join(' & ');

  const results = await db.select({
    id: solos.id,
    title: solos.title,
    username: solos.username,
    displayName: solos.displayName,
    avatarUrl: solos.avatarUrl,
    audioUrl: solos.audioUrl,
    durationMs: solos.durationMs,
    tags: solos.tags,
    timestamp: solos.timestamp,
    userId: solos.userId,
    status: solos.status,
    rank: sql<number>`ts_rank(search_vector, to_tsquery('english', unaccent(${tsQuery})))`.as('rank'),
  })
    .from(solos)
    .where(
      and(
        eq(solos.status, 'ready'),
        or(
          sql`search_vector @@ to_tsquery('english', unaccent(${tsQuery}))`,
          ilike(solos.title, `%${sanitized}%`),
          ilike(solos.searchText, `%${sanitized}%`),
        )
      )
    )
    .orderBy(sql`rank DESC`, desc(solos.timestamp))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db.select({
    count: sql<number>`count(*)::int`,
  })
    .from(solos)
    .where(
      and(
        eq(solos.status, 'ready'),
        or(
          sql`search_vector @@ to_tsquery('english', unaccent(${tsQuery}))`,
          ilike(solos.title, `%${sanitized}%`),
          ilike(solos.searchText, `%${sanitized}%`),
        )
      )
    );

  return { results, total: countResult?.count ?? 0 };
}

export async function searchUsers(query: string, limit = 20, offset = 0) {
  const sanitized = query.replace(/[^\w\s@]/g, '').trim();
  if (!sanitized) return { results: [], total: 0 };

  const whereClause = or(
    sql`similarity(coalesce(username, ''), ${sanitized}) > 0.1`,
    sql`similarity(coalesce(bio, ''), ${sanitized}) > 0.1`,
    ilike(users.username, `%${sanitized}%`),
  );

  const results = await db.select({
    id: users.id,
    username: users.username,
    avatarUrl: users.avatarUrl,
    bio: users.bio,
    similarity: sql<number>`greatest(
      similarity(coalesce(username, ''), ${sanitized}),
      similarity(coalesce(bio, ''), ${sanitized})
    )`.as('sim'),
  })
    .from(users)
    .where(whereClause)
    .orderBy(sql`sim DESC`)
    .limit(limit)
    .offset(offset);

  const [countResult] = await db.select({
    count: sql<number>`count(*)::int`,
  })
    .from(users)
    .where(whereClause);

  return { results, total: countResult?.count ?? 0 };
}

export async function getSearchSuggestions(query: string, limit = 5) {
  const sanitized = query.replace(/[^\w\s]/g, '').trim();
  if (!sanitized) return [];

  const [userSuggestions, soloSuggestions] = await Promise.all([
    db.select({
      text: users.username,
      type: sql<string>`'user'`.as('type'),
    })
      .from(users)
      .where(ilike(users.username, `${sanitized}%`))
      .limit(limit),

    db.select({
      text: solos.title,
      type: sql<string>`'solo'`.as('type'),
    })
      .from(solos)
      .where(and(eq(solos.status, 'ready'), ilike(solos.title, `%${sanitized}%`)))
      .limit(limit),
  ]);

  return [...userSuggestions, ...soloSuggestions].slice(0, limit);
}

export async function getTrendingUsers(limit = 10) {
  return db.select({
    id: users.id,
    username: users.username,
    avatarUrl: users.avatarUrl,
    bio: users.bio,
  })
    .from(users)
    .where(sql`username IS NOT NULL AND username != ''`)
    .orderBy(desc(users.createdAt))
    .limit(limit);
}
