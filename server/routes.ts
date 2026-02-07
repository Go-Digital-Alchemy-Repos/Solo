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
      const filePath = path.join(UPLOADS_DIR, `${fileId}.m4a`);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Audio not found" });
      }

      const stat = fs.statSync(filePath);
      res.set("Content-Type", "audio/mp4");
      res.set("Content-Length", stat.size.toString());
      res.set("Accept-Ranges", "bytes");
      res.set("Cache-Control", "public, max-age=31536000");

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch (error) {
      console.error("Error streaming audio:", error);
      return res.status(404).json({ error: "Audio not found" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
