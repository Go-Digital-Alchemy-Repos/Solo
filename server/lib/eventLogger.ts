import { db } from "../db";
import { systemEvents } from "@shared/schema";
import { logger } from "./logger";

const SENSITIVE_KEYS = new Set([
  "password", "passwordHash", "password_hash", "secret", "token",
  "authorization", "cookie", "session", "api_key", "apiKey",
  "access_token", "refresh_token", "id_token", "private_key",
  "credit_card", "ssn", "connect.sid",
]);

function redactValue(key: string, value: unknown): unknown {
  if (typeof key === "string" && SENSITIVE_KEYS.has(key.toLowerCase())) {
    return "[REDACTED]";
  }
  if (typeof value === "string" && value.length > 500) {
    return value.slice(0, 500) + "...[truncated]";
  }
  return value;
}

export function redactDetails(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((item) => redactDetails(item));

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof value === "object" && value !== null) {
      result[key] = redactDetails(value);
    } else {
      result[key] = redactValue(key, value);
    }
  }
  return result;
}

interface EventContext {
  requestId?: string;
  userId?: string;
  soloId?: string;
}

export async function logEvent(
  level: "info" | "warn" | "error",
  source: string,
  eventType: string,
  message: string,
  details?: Record<string, unknown> | null,
  ctx?: EventContext,
): Promise<void> {
  try {
    const sanitizedDetails = details ? redactDetails(details) : null;

    await db.insert(systemEvents).values({
      level,
      source,
      eventType,
      message: message.slice(0, 2000),
      details: sanitizedDetails as any,
      requestId: ctx?.requestId || null,
      userId: ctx?.userId || null,
      soloId: ctx?.soloId || null,
    });
  } catch (err) {
    logger.error("Failed to log system event", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export const eventLogger = {
  info: (source: string, eventType: string, message: string, details?: Record<string, unknown>, ctx?: EventContext) =>
    logEvent("info", source, eventType, message, details, ctx),
  warn: (source: string, eventType: string, message: string, details?: Record<string, unknown>, ctx?: EventContext) =>
    logEvent("warn", source, eventType, message, details, ctx),
  error: (source: string, eventType: string, message: string, details?: Record<string, unknown>, ctx?: EventContext) =>
    logEvent("error", source, eventType, message, details, ctx),
};
