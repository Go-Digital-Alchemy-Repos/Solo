import { db } from "../db";
import { solos } from "@shared/schema";
import type { SoloStatus, SoloProcessingStep } from "@shared/schema";
import { eq } from "drizzle-orm";
import * as solosService from "../features/solos/solos.service";

export interface ProcessingJob {
  soloId: string;
  audioBuffer: Buffer;
  trimStartSec: number | null;
  trimEndSec: number | null;
  vibeId: string | null;
  durationMs: number;
}

async function updateSoloStatus(
  soloId: string,
  status: SoloStatus,
  step: SoloProcessingStep,
  error?: string,
) {
  const updates: Record<string, any> = {
    status,
    processingStep: step,
    updatedAt: new Date(),
  };
  if (error !== undefined) {
    updates.processingError = error;
  }
  if (status === 'ready') {
    updates.readyAt = new Date();
    updates.processingError = null;
  }
  if (status === 'processing' || status === 'queued') {
    updates.lastAttemptAt = new Date();
  }
  await db.update(solos).set(updates).where(eq(solos.id, soloId));
}

export async function processSolo(job: ProcessingJob): Promise<void> {
  const { soloId, vibeId, durationMs } = job;
  let audioData = job.audioBuffer;

  try {
    await updateSoloStatus(soloId, 'processing', 'trim');

    if (job.trimStartSec !== null && job.trimEndSec !== null && job.trimEndSec > job.trimStartSec) {
      audioData = await solosService.trimAudio(Buffer.from(audioData), job.trimStartSec, job.trimEndSec);
    }

    await updateSoloStatus(soloId, 'processing', 'mix');

    if (vibeId) {
      audioData = await solosService.mixVibeIntoAudio(Buffer.from(audioData), vibeId);
    }

    await updateSoloStatus(soloId, 'processing', 'upload');

    const { filePath, audioUrl } = solosService.saveSoloFile(Buffer.from(audioData));

    await db.update(solos).set({ audioUrl, updatedAt: new Date() }).where(eq(solos.id, soloId));

    await updateSoloStatus(soloId, 'processing', 'transcribe');

    let transcript = null;
    try {
      transcript = await solosService.generateTranscript(soloId, filePath, durationMs);
    } catch (err) {
      console.error(`[Processor] Transcription failed for solo ${soloId}, continuing:`, err);
    }

    await updateSoloStatus(soloId, 'ready', 'done');
    console.log(`[Processor] Solo ${soloId} processing complete`);
  } catch (err: any) {
    const errorMsg = err?.message?.slice(0, 500) || 'Unknown processing error';
    console.error(`[Processor] Solo ${soloId} failed:`, errorMsg);
    await updateSoloStatus(soloId, 'failed', 'upload', errorMsg).catch((dbErr) => {
      console.error(`[Processor] Failed to update status for solo ${soloId}:`, dbErr);
    });
  }
}

export async function retrySolo(soloId: string): Promise<boolean> {
  const [solo] = await db.select().from(solos).where(eq(solos.id, soloId)).limit(1);
  if (!solo || solo.status !== 'failed') {
    return false;
  }

  await db.update(solos).set({
    status: 'queued',
    processingStep: 'upload',
    processingError: null,
    attempts: solo.attempts + 1,
    lastAttemptAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(solos.id, soloId));

  return true;
}
