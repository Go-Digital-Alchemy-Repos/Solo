import type { Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { VIBES_DIR } from "../../utils/paths";

const AVAILABLE_VIBES = [
  { id: "coffee-shop", label: "Coffee Shop", file: "coffee-shop.mp3" },
  { id: "nature", label: "Nature", file: "nature.mp3" },
  { id: "lofi-beat", label: "Lofi Beat", file: "lofi-beat.mp3" },
];

export function list(_req: Request, res: Response) {
  return res.json(AVAILABLE_VIBES.map(v => ({ id: v.id, label: v.label })));
}

export function streamAudio(req: Request, res: Response) {
  const vibe = AVAILABLE_VIBES.find(v => v.id === req.params.vibeId);
  if (!vibe) return res.status(404).json({ error: "Vibe not found" });

  const filePath = path.join(VIBES_DIR, vibe.file);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Vibe file not found" });

  const stat = fs.statSync(filePath);
  res.set("Content-Type", "audio/mpeg");
  res.set("Content-Length", stat.size.toString());
  res.set("Accept-Ranges", "bytes");
  res.set("Cache-Control", "public, max-age=31536000");
  fs.createReadStream(filePath).pipe(res);
}
