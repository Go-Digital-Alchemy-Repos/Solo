import { db } from "../db";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

interface HealthResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
  [key: string]: unknown;
}

interface HealthReport {
  timestamp: string;
  server: HealthResult & { uptimeSeconds: number; nodeVersion: string; env: string };
  db: HealthResult;
  sessions: HealthResult;
  storage: HealthResult;
  ffmpeg: HealthResult & { version?: string };
  transcription: HealthResult & { model?: string };
}

let cachedFfmpeg: { ok: boolean; version?: string; error?: string; checkedAt: number } | null = null;
const FFMPEG_CACHE_TTL = 5 * 60 * 1000;

async function checkDb(): Promise<HealthResult> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkSessions(): Promise<HealthResult> {
  const start = Date.now();
  try {
    const result = await db.execute(sql`SELECT COUNT(*) as cnt FROM session WHERE expire > NOW()`);
    const count = (result as any).rows?.[0]?.cnt ?? (result as any)[0]?.cnt ?? 0;
    return { ok: true, latencyMs: Date.now() - start, activeSessions: Number(count) };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
  }
}

function checkStorage(): HealthResult {
  const uploadsDir = path.resolve(process.cwd(), "uploads");
  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const testFile = path.join(uploadsDir, ".health-check-test");
    fs.writeFileSync(testFile, "ok");
    fs.unlinkSync(testFile);

    const solosDir = path.join(uploadsDir, "solos");
    const avatarsDir = path.join(uploadsDir, "avatars");
    return {
      ok: true,
      solosDir: fs.existsSync(solosDir),
      avatarsDir: fs.existsSync(avatarsDir),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function checkFfmpeg(): HealthResult & { version?: string } {
  const now = Date.now();
  if (cachedFfmpeg && now - cachedFfmpeg.checkedAt < FFMPEG_CACHE_TTL) {
    return { ok: cachedFfmpeg.ok, version: cachedFfmpeg.version, error: cachedFfmpeg.error };
  }

  try {
    const output = execSync("ffmpeg -version 2>&1", { timeout: 5000 }).toString();
    const versionMatch = output.match(/ffmpeg version (\S+)/);
    const version = versionMatch ? versionMatch[1] : "unknown";
    cachedFfmpeg = { ok: true, version, checkedAt: now };
    return { ok: true, version };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    cachedFfmpeg = { ok: false, error, checkedAt: now };
    return { ok: false, error };
  }
}

function checkTranscription(): HealthResult & { model?: string } {
  const hasKey = !!process.env.OPENAI_API_KEY;
  const model = "gpt-4o-mini-transcribe";
  return {
    ok: hasKey,
    model,
    apiKeyConfigured: hasKey,
    error: hasKey ? undefined : "OPENAI_API_KEY not configured",
  };
}

export async function getHealthReport(): Promise<HealthReport> {
  const startTime = process.uptime();

  const [dbResult, sessionsResult] = await Promise.all([
    checkDb(),
    checkSessions(),
  ]);

  const storageResult = checkStorage();
  const ffmpegResult = checkFfmpeg();
  const transcriptionResult = checkTranscription();

  return {
    timestamp: new Date().toISOString(),
    server: {
      ok: true,
      uptimeSeconds: Math.round(startTime),
      nodeVersion: process.version,
      env: process.env.NODE_ENV || "development",
    },
    db: dbResult,
    sessions: sessionsResult,
    storage: storageResult,
    ffmpeg: ffmpegResult,
    transcription: transcriptionResult,
  };
}
