import crypto from "crypto";

export type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  requestId?: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  userId?: string;
  soloId?: string;
  step?: string;
  message: string;
  error?: string;
  [key: string]: unknown;
}

function formatEntry(entry: LogEntry): string {
  const parts: string[] = [
    entry.timestamp,
    `[${entry.level.toUpperCase()}]`,
  ];

  if (entry.requestId) parts.push(`rid=${entry.requestId}`);
  if (entry.method && entry.path) parts.push(`${entry.method} ${entry.path}`);
  if (entry.status !== undefined) parts.push(`${entry.status}`);
  if (entry.durationMs !== undefined) parts.push(`${entry.durationMs}ms`);
  if (entry.userId) parts.push(`uid=${entry.userId.slice(0, 8)}`);
  if (entry.soloId) parts.push(`solo=${entry.soloId.slice(0, 8)}`);
  if (entry.step) parts.push(`step=${entry.step}`);
  parts.push(entry.message);
  if (entry.error) parts.push(`err="${entry.error}"`);

  return parts.join(" ");
}

function now(): string {
  return new Date().toISOString();
}

export function generateRequestId(): string {
  return crypto.randomBytes(6).toString("hex");
}

export const logger = {
  info(message: string, meta?: Partial<LogEntry>) {
    const entry: LogEntry = { timestamp: now(), level: "info", message, ...meta };
    console.log(formatEntry(entry));
  },

  warn(message: string, meta?: Partial<LogEntry>) {
    const entry: LogEntry = { timestamp: now(), level: "warn", message, ...meta };
    console.warn(formatEntry(entry));
  },

  error(message: string, meta?: Partial<LogEntry>) {
    const entry: LogEntry = { timestamp: now(), level: "error", message, ...meta };
    console.error(formatEntry(entry));
  },

  debug(message: string, meta?: Partial<LogEntry>) {
    if (process.env.NODE_ENV === "production") return;
    const entry: LogEntry = { timestamp: now(), level: "debug", message, ...meta };
    console.log(formatEntry(entry));
  },

  request(meta: {
    requestId: string;
    method: string;
    path: string;
    status: number;
    durationMs: number;
    userId?: string;
  }) {
    const level: LogLevel = meta.status >= 500 ? "error" : meta.status >= 400 ? "warn" : "info";
    const entry: LogEntry = {
      timestamp: now(),
      level,
      message: "request",
      ...meta,
    };
    console.log(formatEntry(entry));
  },

  processing(soloId: string, step: string, message: string, extra?: Partial<LogEntry>) {
    const entry: LogEntry = {
      timestamp: now(),
      level: "info",
      soloId,
      step,
      message,
      ...extra,
    };
    console.log(formatEntry(entry));
  },
};
