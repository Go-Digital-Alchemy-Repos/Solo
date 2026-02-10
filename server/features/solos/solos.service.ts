import { db } from "../../db";
import { solos, users } from "@shared/schema";
import type { Transcript } from "@shared/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { writeFile, unlink, readFile } from "fs/promises";
import { openai, ensureCompatibleFormat } from "../../replit_integrations/audio/client";
import { toFile } from "openai";
import { UPLOADS_DIR, VIBES_DIR } from "../../utils/paths";
import { updateSoloSearchFields } from "../search/search.service";

const AVAILABLE_VIBES = [
  { id: "coffee-shop", label: "Coffee Shop", file: "coffee-shop.mp3" },
  { id: "nature", label: "Nature", file: "nature.mp3" },
  { id: "lofi-beat", label: "Lofi Beat", file: "lofi-beat.mp3" },
];

export { AVAILABLE_VIBES };

export async function findUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user || null;
}

export async function createSolo(data: {
  userId: string;
  username: string;
  audioUrl: string;
  tags: string[];
  avatarUrl: string | null;
  title: string;
  durationMs: number;
  displayName: string;
  status?: string;
  processingStep?: string;
}) {
  const [solo] = await db.insert(solos).values(data).returning();
  return solo;
}

export async function listSolos(tag?: string) {
  if (tag) {
    return db.select().from(solos)
      .where(and(eq(solos.status, 'ready'), sql`${tag} = ANY(${solos.tags})`))
      .orderBy(desc(solos.timestamp))
      .limit(50);
  }
  return db.select().from(solos)
    .where(eq(solos.status, 'ready'))
    .orderBy(desc(solos.timestamp))
    .limit(50);
}

export async function getSoloById(soloId: string) {
  const [solo] = await db.select().from(solos).where(eq(solos.id, soloId)).limit(1);
  return solo || null;
}

export async function deleteSolo(soloId: string) {
  await db.delete(solos).where(eq(solos.id, soloId));
}

export async function updateSolo(soloId: string, updates: Record<string, any>) {
  const [updated] = await db
    .update(solos)
    .set(updates)
    .where(eq(solos.id, soloId))
    .returning();

  if (updates.title || updates.tags) {
    updateSoloSearchFields(soloId).catch(() => {});
  }

  return updated;
}

export async function getUserSolos(userId: string) {
  return db
    .select()
    .from(solos)
    .where(eq(solos.userId, userId))
    .orderBy(desc(solos.timestamp));
}

export function saveSoloFile(audioData: Buffer): { fileId: string; filePath: string; audioUrl: string } {
  const fileId = randomUUID();
  const fileName = `${fileId}.m4a`;
  const filePath = path.join(UPLOADS_DIR, fileName);
  fs.writeFileSync(filePath, audioData);
  return { fileId, filePath, audioUrl: `/api/audio/${fileId}` };
}

export function deleteAudioFile(audioUrl: string) {
  const audioFileId = audioUrl.replace("/api/audio/", "");
  const filePath = path.join(UPLOADS_DIR, `${audioFileId}.m4a`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function getAudioFilePath(fileId: string): string | null {
  const sanitized = fileId.replace(/[^a-zA-Z0-9\-]/g, "");
  const filePath = path.join(UPLOADS_DIR, `${sanitized}.m4a`);
  return fs.existsSync(filePath) ? filePath : null;
}

export async function generateTranscript(soloId: string, audioFilePath: string, durationMs: number): Promise<Transcript | null> {
  try {
    const audioBuffer = fs.readFileSync(audioFilePath);
    const { buffer: compatBuffer, format } = await ensureCompatibleFormat(Buffer.from(audioBuffer));

    const file = await toFile(compatBuffer, `audio.${format}`);
    const response = await openai.audio.transcriptions.create({
      file,
      model: "gpt-4o-mini-transcribe",
    });

    const text = response.text || "";
    const wordsFromText = text.split(/\s+/).filter(Boolean);
    const durationSec = durationMs / 1000;
    const pauseFraction = 0.1;
    const speakingDuration = durationSec * (1 - pauseFraction);
    const wordDuration = speakingDuration / Math.max(wordsFromText.length, 1);
    const startOffset = durationSec * (pauseFraction / 2);

    const words = wordsFromText.map((w: string, i: number) => ({
      word: w,
      start: startOffset + i * wordDuration,
      end: startOffset + (i + 1) * wordDuration,
    }));

    const transcript: Transcript = { text, words };

    await db.update(solos)
      .set({ transcript })
      .where(eq(solos.id, soloId));

    updateSoloSearchFields(soloId).catch(() => {});

    return transcript;
  } catch (error) {
    console.error("Transcript generation error for solo", soloId, error);
    return null;
  }
}

export async function trimAudio(audioBuffer: Buffer, trimStartSec: number, trimEndSec: number): Promise<Buffer> {
  const inputPath = path.join(tmpdir(), `trim-in-${randomUUID()}`);
  const outputPath = path.join(tmpdir(), `trim-out-${randomUUID()}.m4a`);
  try {
    await writeFile(inputPath, audioBuffer);
    const duration = trimEndSec - trimStartSec;
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-i", inputPath,
        "-ss", trimStartSec.toString(),
        "-t", duration.toString(),
        "-c", "copy",
        "-y",
        outputPath,
      ]);
      ffmpeg.stderr.on("data", () => {});
      ffmpeg.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg trim exited with code ${code}`));
      });
      ffmpeg.on("error", reject);
    });
    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

export async function mixVibeIntoAudio(audioBuffer: Buffer, vibeId: string): Promise<Buffer> {
  const vibe = AVAILABLE_VIBES.find(v => v.id === vibeId);
  if (!vibe) return audioBuffer;

  const vibePath = path.join(VIBES_DIR, vibe.file);
  if (!fs.existsSync(vibePath)) return audioBuffer;

  const inputPath = path.join(tmpdir(), `mix-in-${randomUUID()}.m4a`);
  const outputPath = path.join(tmpdir(), `mix-out-${randomUUID()}.m4a`);
  try {
    await writeFile(inputPath, audioBuffer);
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-i", inputPath,
        "-i", vibePath,
        "-filter_complex", "[0:a]volume=1.0[voice];[1:a]volume=0.10[bg];[voice][bg]amix=inputs=2:duration=first:dropout_transition=2:weights=10 1",
        "-c:a", "aac",
        "-b:a", "192k",
        "-y",
        outputPath,
      ]);
      ffmpeg.stderr.on("data", () => {});
      ffmpeg.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg mix exited with code ${code}`));
      });
      ffmpeg.on("error", reject);
    });
    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}
