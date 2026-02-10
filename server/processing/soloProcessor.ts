import { db } from "../db";
import { solos } from "@shared/schema";
import type { SoloStatus, SoloProcessingStep } from "@shared/schema";
import { eq } from "drizzle-orm";
import * as solosService from "../features/solos/solos.service";
import { updateSoloSearchFields } from "../features/search/search.service";
import { logger } from "../lib/logger";

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
  logger.processing(soloId, step, `status → ${status}`);
}

export async function processSolo(job: ProcessingJob): Promise<void> {
  const { soloId, vibeId, durationMs } = job;
  let audioData = job.audioBuffer;
  const startTime = Date.now();

  logger.processing(soloId, 'start', `begin processing (${(audioData.length / 1024).toFixed(0)}KB, vibeId=${vibeId || 'none'})`);

  try {
    await updateSoloStatus(soloId, 'processing', 'trim');

    if (job.trimStartSec !== null && job.trimEndSec !== null && job.trimEndSec > job.trimStartSec) {
      logger.processing(soloId, 'trim', `trimming ${job.trimStartSec}s–${job.trimEndSec}s`);
      audioData = await solosService.trimAudio(Buffer.from(audioData), job.trimStartSec, job.trimEndSec);
      logger.processing(soloId, 'trim', `trimmed to ${(audioData.length / 1024).toFixed(0)}KB`);
    } else {
      logger.processing(soloId, 'trim', 'no trim needed');
    }

    await updateSoloStatus(soloId, 'processing', 'mix');

    if (vibeId) {
      logger.processing(soloId, 'mix', `mixing vibe ${vibeId}`);
      audioData = await solosService.mixVibeIntoAudio(Buffer.from(audioData), vibeId);
      logger.processing(soloId, 'mix', `mixed to ${(audioData.length / 1024).toFixed(0)}KB`);
    } else {
      logger.processing(soloId, 'mix', 'no vibe to mix');
    }

    await updateSoloStatus(soloId, 'processing', 'upload');

    const { filePath, audioUrl } = solosService.saveSoloFile(Buffer.from(audioData));
    logger.processing(soloId, 'upload', `saved to ${audioUrl}`);

    await db.update(solos).set({ audioUrl, updatedAt: new Date() }).where(eq(solos.id, soloId));

    await updateSoloStatus(soloId, 'processing', 'transcribe');

    try {
      await solosService.generateTranscript(soloId, filePath, durationMs);
      logger.processing(soloId, 'transcribe', 'transcription complete');
    } catch (err: any) {
      logger.warn(`Transcription failed, continuing`, {
        soloId,
        step: 'transcribe',
        error: err?.message?.slice(0, 300),
      });
    }

    try {
      await updateSoloSearchFields(soloId);
      logger.processing(soloId, 'index', 'search index updated');
    } catch (err: any) {
      logger.warn('Search indexing failed, continuing', { soloId, error: err?.message?.slice(0, 300) });
    }

    await updateSoloStatus(soloId, 'ready', 'done');
    const totalMs = Date.now() - startTime;
    logger.processing(soloId, 'done', `processing complete in ${totalMs}ms`);
  } catch (err: any) {
    const errorMsg = err?.message?.slice(0, 500) || 'Unknown processing error';
    const totalMs = Date.now() - startTime;
    logger.error(`Processing failed after ${totalMs}ms`, {
      soloId,
      error: errorMsg,
    });
    await updateSoloStatus(soloId, 'failed', 'upload', errorMsg).catch((dbErr: any) => {
      logger.error(`Failed to update status`, {
        soloId,
        error: dbErr?.message,
      });
    });
  }
}

export async function retrySolo(soloId: string): Promise<boolean> {
  const [solo] = await db.select().from(solos).where(eq(solos.id, soloId)).limit(1);
  if (!solo || solo.status !== 'failed') {
    logger.warn(`Retry rejected: solo not found or not failed`, { soloId });
    return false;
  }

  logger.processing(soloId, 'retry', `attempt ${solo.attempts + 1}`);

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
