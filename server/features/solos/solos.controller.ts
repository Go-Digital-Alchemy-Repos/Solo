import type { Request, Response } from "express";
import * as solosService from "./solos.service";
import { requireAuth } from "../../utils/auth-helpers";
import * as fs from "fs";

export async function create(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No audio file provided" });
  }

  const { title, durationMs, tags, trimStartMs, trimEndMs } = req.body;
  if (!title) {
    return res.status(400).json({ error: "title is required" });
  }

  const user = await solosService.findUserById(userId);
  if (!user || !user.username) {
    return res.status(400).json({ error: "Complete your profile setup first" });
  }

  let audioData = file.buffer;
  const trimStart = trimStartMs ? parseFloat(trimStartMs) / 1000 : null;
  const trimEnd = trimEndMs ? parseFloat(trimEndMs) / 1000 : null;
  if (trimStart !== null && trimEnd !== null && trimEnd > trimStart) {
    audioData = await solosService.trimAudio(Buffer.from(audioData), trimStart, trimEnd);
  }

  const { vibeId } = req.body;
  if (vibeId && typeof vibeId === "string") {
    audioData = await solosService.mixVibeIntoAudio(Buffer.from(audioData), vibeId);
  }

  const { filePath, audioUrl } = solosService.saveSoloFile(Buffer.from(audioData));
  const parsedTags = tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : [];

  const solo = await solosService.createSolo({
    userId: user.id,
    username: user.username,
    audioUrl,
    tags: parsedTags,
    avatarUrl: user.avatarUrl || null,
    title,
    durationMs: parseInt(durationMs) || 0,
    displayName: user.username,
  });

  solosService.generateTranscript(solo.id, filePath, solo.durationMs).catch(err => {
    console.error("Background transcription failed:", err);
  });

  return res.status(201).json(solo);
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
    return res.status(404).json({ error: "Solo not found" });
  }
  if (solo.userId !== userId) {
    return res.status(403).json({ error: "You can only delete your own solos" });
  }

  solosService.deleteAudioFile(solo.audioUrl);
  await solosService.deleteSolo(soloId);
  return res.json({ success: true });
}

export async function update(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { soloId } = req.params;
  const solo = await solosService.getSoloById(soloId);
  if (!solo) {
    return res.status(404).json({ error: "Solo not found" });
  }
  if (solo.userId !== userId) {
    return res.status(403).json({ error: "You can only edit your own solos" });
  }

  const { title, tags } = req.body;
  const updates: Record<string, any> = {};
  if (title !== undefined) updates.title = title;
  if (tags !== undefined) updates.tags = Array.isArray(tags) ? tags : JSON.parse(tags);

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "Nothing to update" });
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
    return res.status(404).json({ error: "Audio not found" });
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
    return res.status(404).json({ error: "Solo not found" });
  }

  if (solo.transcript) {
    return res.json({ transcript: solo.transcript });
  }

  const fileId = solo.audioUrl.replace('/api/audio/', '');
  const filePath = solosService.getAudioFilePath(fileId);

  if (!filePath) {
    return res.status(404).json({ error: "Audio file not found" });
  }

  const transcript = await solosService.generateTranscript(soloId, filePath, solo.durationMs);
  if (!transcript) {
    return res.status(500).json({ error: "Failed to transcribe audio" });
  }

  return res.json({ transcript });
}
