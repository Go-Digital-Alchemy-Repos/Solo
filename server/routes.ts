import type { Express } from "express";
import { createServer, type Server } from "node:http";
import multer from "multer";
import { db } from "./db";
import { solos } from "@shared/schema";
import { desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads", "solos");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/solos", upload.single("audio"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      const { username, title, durationMs, tags, avatarUrl, displayName } = req.body;
      if (!username || !title) {
        return res.status(400).json({ error: "username and title are required" });
      }

      const fileId = randomUUID();
      const fileName = `${fileId}.m4a`;
      const filePath = path.join(UPLOADS_DIR, fileName);

      fs.writeFileSync(filePath, file.buffer);

      const audioUrl = `/api/audio/${fileId}`;

      const parsedTags = tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : [];

      const [solo] = await db.insert(solos).values({
        username,
        audioUrl,
        tags: parsedTags,
        avatarUrl: avatarUrl || null,
        title,
        durationMs: parseInt(durationMs) || 0,
        displayName: displayName || username,
      }).returning();

      return res.status(201).json(solo);
    } catch (error) {
      console.error("Error creating solo:", error);
      return res.status(500).json({ error: "Failed to create solo" });
    }
  });

  app.get("/api/solos", async (_req, res) => {
    try {
      const latestSolos = await db
        .select()
        .from(solos)
        .orderBy(desc(solos.timestamp))
        .limit(20);

      return res.json(latestSolos);
    } catch (error) {
      console.error("Error fetching solos:", error);
      return res.status(500).json({ error: "Failed to fetch solos" });
    }
  });

  app.get("/api/audio/:fileId", (req, res) => {
    try {
      const { fileId } = req.params;
      const sanitized = fileId.replace(/[^a-zA-Z0-9\-]/g, "");
      const filePath = path.join(UPLOADS_DIR, `${sanitized}.m4a`);

      if (!fs.existsSync(filePath)) {
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
    } catch (error) {
      console.error("Error streaming audio:", error);
      return res.status(404).json({ error: "Audio not found" });
    }
  });

  app.options("/api/audio/:fileId", (_req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Range, Content-Type");
    res.set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
    return res.sendStatus(204);
  });

  const httpServer = createServer(app);
  return httpServer;
}
