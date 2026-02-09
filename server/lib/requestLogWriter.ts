import { db } from "../db";
import { requestLogs } from "@shared/schema";
import { logger } from "./logger";

interface RequestLogData {
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  userId?: string;
  ip?: string;
  userAgent?: string;
}

export async function writeRequestLog(data: RequestLogData): Promise<void> {
  try {
    await db.insert(requestLogs).values({
      requestId: data.requestId,
      method: data.method,
      path: data.path.slice(0, 500),
      status: data.status,
      durationMs: data.durationMs,
      userId: data.userId || null,
      ip: data.ip || null,
      userAgent: data.userAgent ? data.userAgent.slice(0, 500) : null,
    });
  } catch (err) {
    logger.error("Failed to write request log", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
