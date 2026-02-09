import { Router } from "express";
import type { Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireAdmin } from "../../utils/auth-helpers";
import { AppError } from "../../lib/errors";
import { db } from "../../db";
import { systemEvents, requestLogs, solos } from "@shared/schema";
import { eq, desc, sql, and, gte, isNull, isNotNull, lte } from "drizzle-orm";
import { getHealthReport } from "../../services/healthCheck";
import { logger } from "../../lib/logger";

const router = Router();

const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_WINDOW = 5000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const last = rateLimitMap.get(key);
  if (last && now - last < RATE_LIMIT_WINDOW) {
    return false;
  }
  rateLimitMap.set(key, now);
  return true;
}

router.get("/health", asyncHandler(async (req: Request, res: Response) => {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const report = await getHealthReport();
  return res.json({ ok: true, data: report });
}));

router.get("/events", asyncHandler(async (req: Request, res: Response) => {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const level = req.query.level as string | undefined;
  const source = req.query.source as string | undefined;
  const resolved = req.query.resolved as string | undefined;
  const cursor = req.query.cursor as string | undefined;

  const conditions: any[] = [];

  if (level && ['info', 'warn', 'error'].includes(level)) {
    conditions.push(eq(systemEvents.level, level));
  }
  if (source) {
    conditions.push(eq(systemEvents.source, source));
  }
  if (resolved === "true") {
    conditions.push(isNotNull(systemEvents.resolvedAt));
  } else if (resolved === "false") {
    conditions.push(isNull(systemEvents.resolvedAt));
  }
  if (cursor) {
    conditions.push(lte(systemEvents.createdAt, new Date(cursor)));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const events = await db
    .select()
    .from(systemEvents)
    .where(where)
    .orderBy(desc(systemEvents.createdAt))
    .limit(limit + 1);

  const hasMore = events.length > limit;
  const results = hasMore ? events.slice(0, limit) : events;
  const nextCursor = hasMore ? results[results.length - 1].createdAt?.toISOString() : null;

  const counts = await db
    .select({
      level: systemEvents.level,
      count: sql<number>`count(*)::int`,
    })
    .from(systemEvents)
    .where(isNull(systemEvents.resolvedAt))
    .groupBy(systemEvents.level);

  const summary: Record<string, number> = {};
  for (const row of counts) {
    summary[row.level] = row.count;
  }

  return res.json({ ok: true, data: { events: results, summary, nextCursor } });
}));

router.post("/events/:eventId/resolve", asyncHandler(async (req: Request, res: Response) => {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const { eventId } = req.params;
  const { resolutionNote } = req.body || {};

  const [event] = await db.select().from(systemEvents).where(eq(systemEvents.id, eventId)).limit(1);
  if (!event) {
    throw AppError.notFound("Event not found");
  }
  if (event.resolvedAt) {
    throw AppError.badRequest("Event is already resolved");
  }

  const [updated] = await db
    .update(systemEvents)
    .set({
      resolvedAt: new Date(),
      resolvedByUserId: userId,
      resolutionNote: resolutionNote ? String(resolutionNote).slice(0, 1000) : null,
    })
    .where(eq(systemEvents.id, eventId))
    .returning();

  logger.info(`Admin resolved event ${eventId}`, { userId });

  return res.json({ ok: true, data: updated });
}));

router.get("/request-logs", asyncHandler(async (req: Request, res: Response) => {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const minStatus = parseInt(req.query.minStatus as string) || 0;
  const pathFilter = req.query.path as string | undefined;
  const cursor = req.query.cursor as string | undefined;

  const conditions: any[] = [];

  if (minStatus > 0) {
    conditions.push(gte(requestLogs.status, minStatus));
  }
  if (pathFilter) {
    conditions.push(sql`${requestLogs.path} ILIKE ${'%' + pathFilter + '%'}`);
  }
  if (cursor) {
    conditions.push(lte(requestLogs.createdAt, new Date(cursor)));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const logs = await db
    .select()
    .from(requestLogs)
    .where(where)
    .orderBy(desc(requestLogs.createdAt))
    .limit(limit + 1);

  const hasMore = logs.length > limit;
  const results = hasMore ? logs.slice(0, limit) : logs;
  const nextCursor = hasMore ? results[results.length - 1].createdAt?.toISOString() : null;

  return res.json({ ok: true, data: { logs: results, nextCursor } });
}));

router.post("/solos/:soloId/retry", asyncHandler(async (req: Request, res: Response) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { soloId } = req.params;

  const [solo] = await db.select().from(solos).where(eq(solos.id, soloId)).limit(1);
  if (!solo) {
    throw AppError.notFound("Solo not found");
  }
  if (solo.status !== 'failed') {
    throw AppError.badRequest(`Solo is in '${solo.status}' state, only 'failed' jobs can be retried`);
  }
  if (solo.attempts >= 5) {
    throw AppError.badRequest(`Solo has exceeded max retry attempts (${solo.attempts})`);
  }

  await db.update(solos).set({
    status: 'queued',
    processingStep: 'upload',
    processingError: null,
    attempts: solo.attempts + 1,
    lastAttemptAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(solos.id, soloId));

  logger.info(`Admin retry via system-status: solo ${soloId} (attempt ${solo.attempts + 1})`, { soloId });

  return res.json({ ok: true, data: { soloId, newAttempt: solo.attempts + 1 } });
}));

router.post("/transcription/test", asyncHandler(async (req: Request, res: Response) => {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  if (!checkRateLimit("transcription-test")) {
    throw AppError.tooManyRequests("Please wait before testing again");
  }

  const hasKey = !!process.env.OPENAI_API_KEY;
  if (!hasKey) {
    return res.json({ ok: true, data: { success: false, error: "OPENAI_API_KEY not configured" } });
  }

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI();
    const models = await openai.models.list();
    return res.json({ ok: true, data: { success: true, modelsAvailable: true } });
  } catch (err) {
    return res.json({
      ok: true,
      data: {
        success: false,
        error: err instanceof Error ? err.message.slice(0, 200) : "Unknown error",
      },
    });
  }
}));

router.get("/verbose-logging", asyncHandler(async (req: Request, res: Response) => {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  return res.json({ ok: true, data: { enabled: process.env.VERBOSE_REQUEST_LOGS === "true" } });
}));

router.post("/verbose-logging", asyncHandler(async (req: Request, res: Response) => {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  if (process.env.NODE_ENV === "production") {
    throw AppError.badRequest("Verbose logging can only be toggled in development");
  }

  const { enabled } = req.body || {};
  process.env.VERBOSE_REQUEST_LOGS = enabled ? "true" : "false";

  logger.info(`Admin toggled verbose logging: ${enabled ? "ON" : "OFF"}`, { userId });

  return res.json({ ok: true, data: { enabled: !!enabled } });
}));

export default router;
