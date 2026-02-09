import type { Request, Response } from "express";
import * as solosService from "./solos.service";
import { requireAuth } from "../../utils/auth-helpers";
import { AppError } from "../../lib/errors";
import { processSolo, retrySolo } from "../../processing/soloProcessor";
import * as fs from "fs";

export async function create(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const file = req.file;
  if (!file) {
    throw AppError.badRequest("No audio file provided");
  }

  const { title, durationMs, tags, trimStartMs, trimEndMs, vibeId } = req.body;
  if (!title) {
    throw AppError.validationFailed({ title: ["Title is required"] });
  }

  const user = await solosService.findUserById(userId);
  if (!user || !user.username) {
    throw AppError.badRequest("Complete your profile setup first");
  }

  const parsedTags = tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : [];
  const effectiveDurationMs = parseInt(durationMs) || 0;

  const solo = await solosService.createSolo({
    userId: user.id,
    username: user.username,
    audioUrl: '',
    tags: parsedTags,
    avatarUrl: user.avatarUrl || null,
    title,
    durationMs: effectiveDurationMs,
    displayName: user.username,
    status: 'queued',
    processingStep: 'upload',
  });

  res.status(201).json({ id: solo.id, status: 'queued', processingStep: 'upload' });

  const trimStart = trimStartMs ? parseFloat(trimStartMs) / 1000 : null;
  const trimEnd = trimEndMs ? parseFloat(trimEndMs) / 1000 : null;

  processSolo({
    soloId: solo.id,
    audioBuffer: file.buffer,
    trimStartSec: trimStart,
    trimEndSec: trimEnd,
    vibeId: vibeId && typeof vibeId === 'string' ? vibeId : null,
    durationMs: effectiveDurationMs,
  }).catch((err) => {
    console.error(`[Controller] Background processing error for solo ${solo.id}:`, err);
  });
}

export async function getStatus(req: Request, res: Response) {
  const { soloId } = req.params;
  const solo = await solosService.getSoloById(soloId);
  if (!solo) {
    throw AppError.notFound("Solo not found");
  }

  return res.json({
    id: solo.id,
    status: solo.status,
    processingStep: solo.processingStep,
    processingError: solo.processingError,
    attempts: solo.attempts,
    readyAt: solo.readyAt,
  });
}

export async function retry(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { soloId } = req.params;
  const solo = await solosService.getSoloById(soloId);
  if (!solo) {
    throw AppError.notFound("Solo not found");
  }
  if (solo.userId !== userId) {
    throw AppError.forbidden("You can only retry your own solos");
  }
  if (solo.status !== 'failed') {
    throw AppError.badRequest("Solo is not in a failed state");
  }

  const requeued = await retrySolo(soloId);
  if (!requeued) {
    throw AppError.badRequest("Could not re-queue solo");
  }

  res.json({ id: soloId, status: 'queued', processingStep: 'upload' });

  const fileId = solo.audioUrl?.replace('/api/audio/', '');
  const filePath = fileId ? solosService.getAudioFilePath(fileId) : null;
  if (filePath) {
    const audioBuffer = fs.readFileSync(filePath);
    processSolo({
      soloId,
      audioBuffer: Buffer.from(audioBuffer),
      trimStartSec: null,
      trimEndSec: null,
      vibeId: null,
      durationMs: solo.durationMs,
    }).catch((err) => {
      console.error(`[Controller] Retry processing error for solo ${soloId}:`, err);
    });
  }
}

export async function list(req: Request, res: Response) {
  const tag = req.query.tag as string | undefined;
  const latestSolos = await solosService.listSolos(tag);
  return res.json(latestSolos);
}

export async function remove(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { soloId } = req.params;
  const solo = await solosService.getSoloById(soloId);
  if (!solo) {
    throw AppError.notFound("Solo not found");
  }
  if (solo.userId !== userId) {
    throw AppError.forbidden("You can only delete your own solos");
  }

  solosService.deleteAudioFile(solo.audioUrl);
  await solosService.deleteSolo(soloId);
  return res.json({ ok: true });
}

export async function update(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { soloId } = req.params;
  const solo = await solosService.getSoloById(soloId);
  if (!solo) {
    throw AppError.notFound("Solo not found");
  }
  if (solo.userId !== userId) {
    throw AppError.forbidden("You can only edit your own solos");
  }

  const { title, tags } = req.body;
  const updates: Record<string, any> = {};
  if (title !== undefined) updates.title = title;
  if (tags !== undefined) updates.tags = Array.isArray(tags) ? tags : JSON.parse(tags);

  if (Object.keys(updates).length === 0) {
    throw AppError.badRequest("Nothing to update");
  }

  const updated = await solosService.updateSolo(soloId, updates);
  return res.json(updated);
}

export async function userSolos(req: Request, res: Response) {
  const { userId } = req.params;
  const result = await solosService.getUserSolos(userId);
  return res.json(result);
}

export function streamAudio(req: Request, res: Response) {
  const { fileId } = req.params;
  const filePath = solosService.getAudioFilePath(fileId);

  if (!filePath) {
    throw AppError.notFound("Audio not found");
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;

  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Range, Content-Type");
  res.set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
  res.set("Content-Type", "audio/x-m4a");
  res.set("Accept-Ranges", "bytes");
  res.set("Cache-Control", "public, max-age=31536000");

  const rangeHeader = req.headers.range;
  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize || start > end) {
      res.status(416).set("Content-Range", `bytes */${fileSize}`);
      return res.end();
    }

    const chunkSize = end - start + 1;
    res.status(206);
    res.set("Content-Range", `bytes ${start}-${end}/${fileSize}`);
    res.set("Content-Length", chunkSize.toString());

    const stream = fs.createReadStream(filePath, { start, end });
    stream.pipe(res);
  } else {
    res.set("Content-Length", fileSize.toString());
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }
}

export function audioOptions(_req: Request, res: Response) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Range, Content-Type");
  res.set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
  return res.sendStatus(204);
}

export async function transcribe(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { soloId } = req.params;
  const solo = await solosService.getSoloById(soloId);
  if (!solo) {
    throw AppError.notFound("Solo not found");
  }

  if (solo.transcript) {
    return res.json({ transcript: solo.transcript });
  }

  const fileId = solo.audioUrl.replace('/api/audio/', '');
  const filePath = solosService.getAudioFilePath(fileId);

  if (!filePath) {
    throw AppError.notFound("Audio file not found");
  }

  const transcript = await solosService.generateTranscript(soloId, filePath, solo.durationMs);
  if (!transcript) {
    throw AppError.internal("Failed to transcribe audio");
  }

  return res.json({ transcript });
}
