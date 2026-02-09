import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import multer from "multer";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { solos, users } from "@shared/schema";
import type { Transcript } from "@shared/schema";
import { desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { openai, ensureCompatibleFormat } from "./replit_integrations/audio/client";
import { toFile } from "openai";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { writeFile, unlink, readFile } from "fs/promises";
import cookieSignature from "cookie-signature";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads", "solos");
const AVATARS_DIR = path.resolve(process.cwd(), "uploads", "avatars");
const VIBES_DIR = path.resolve(process.cwd(), "uploads", "vibes");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(AVATARS_DIR)) {
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

async function requireAuth(req: Request, res: Response): Promise<string | null> {
  let userId = req.session?.userId;

  if (!userId) {
    const sessionToken = req.headers['x-session-token'] as string | undefined;
    if (sessionToken) {
      const secret = process.env.SESSION_SECRET || "solo-secret-fallback";
      let rawSid = sessionToken;
      if (rawSid.startsWith('connect.sid=')) {
        rawSid = rawSid.replace('connect.sid=', '');
      }
      if (rawSid.startsWith('s%3A') || rawSid.startsWith('s:')) {
        rawSid = decodeURIComponent(rawSid).replace(/^s:/, '');
      }
      const unsigned = cookieSignature.unsign(rawSid, secret);
      if (unsigned !== false) {
        try {
          const sess = await new Promise<any>((resolve, reject) => {
            req.sessionStore.get(unsigned as string, (err: any, session: any) => {
              if (err) reject(err);
              else resolve(session);
            });
          });
          if (sess?.userId) {
            userId = sess.userId;
          }
        } catch {}
      }
    }
  }

  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  return userId;
}

function getSessionCookie(req: Request): string {
  const secret = process.env.SESSION_SECRET || "solo-secret-fallback";
  const signed = cookieSignature.sign(req.sessionID, secret);
  return `connect.sid=s%3A${encodeURIComponent(signed).replace(/%3A/g, ':')}`;
}

async function generateTranscript(soloId: string, audioFilePath: string, durationMs: number): Promise<Transcript | null> {
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

    return transcript;
  } catch (error) {
    console.error("Transcript generation error for solo", soloId, error);
    return null;
  }
}

const AVAILABLE_VIBES = [
  { id: "coffee-shop", label: "Coffee Shop", file: "coffee-shop.mp3" },
  { id: "nature", label: "Nature", file: "nature.mp3" },
  { id: "lofi-beat", label: "Lofi Beat", file: "lofi-beat.mp3" },
];

async function mixVibeIntoAudio(audioBuffer: Buffer, vibeId: string): Promise<Buffer> {
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

async function trimAudio(audioBuffer: Buffer, trimStartSec: number, trimEndSec: number): Promise<Buffer> {
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

export async function registerRoutes(app: Express): Promise<Server> {

  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      const emailLower = email.toLowerCase().trim();

      const existing = await db.select().from(users).where(eq(users.email, emailLower)).limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ error: "An account with this email already exists" });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const [user] = await db.insert(users).values({
        email: emailLower,
        passwordHash,
      }).returning();

      req.session.userId = user.id;
      req.session.save(() => {
        return res.status(201).json({
          id: user.id,
          email: user.email,
          username: user.username,
          avatarUrl: user.avatarUrl,
          bio: user.bio,
          sessionCookie: getSessionCookie(req),
        });
      });
    } catch (error) {
      console.error("Signup error:", error);
      return res.status(500).json({ error: "Failed to create account" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }
      const emailLower = email.toLowerCase().trim();

      const [user] = await db.select().from(users).where(eq(users.email, emailLower)).limit(1);
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      req.session.userId = user.id;
      req.session.save(() => {
        return res.json({
          id: user.id,
          email: user.email,
          username: user.username,
          avatarUrl: user.avatarUrl,
          bio: user.bio,
          sessionCookie: getSessionCookie(req),
        });
      });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ error: "Failed to log in" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to log out" });
      }
      res.clearCookie("connect.sid");
      return res.json({ success: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ error: "User not found" });
      }
      return res.json({
        id: user.id,
        email: user.email,
        username: user.username,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
      });
    } catch (error) {
      console.error("Auth check error:", error);
      return res.status(500).json({ error: "Failed to check auth" });
    }
  });

  app.put("/api/auth/profile", upload.single("avatar"), async (req, res) => {
    const userId = await requireAuth(req, res);
    if (!userId) return;

    try {
      const { username, bio } = req.body;
      const updates: Record<string, unknown> = {};

      if (username) {
        const usernameLower = username.toLowerCase().trim();
        if (!/^[a-z0-9_]{3,20}$/.test(usernameLower)) {
          return res.status(400).json({ error: "Username must be 3-20 characters, only letters, numbers, and underscores" });
        }
        const existing = await db.select().from(users).where(eq(users.username, usernameLower)).limit(1);
        if (existing.length > 0 && existing[0].id !== userId) {
          return res.status(409).json({ error: "Username is already taken" });
        }
        updates.username = usernameLower;
      }

      if (bio !== undefined) {
        updates.bio = bio.trim().slice(0, 160);
      }

      if (req.file) {
        const fileId = randomUUID();
        const ext = req.file.mimetype.includes("png") ? "png" : "jpg";
        const fileName = `${fileId}.${ext}`;
        const filePath = path.join(AVATARS_DIR, fileName);
        fs.writeFileSync(filePath, req.file.buffer);
        updates.avatarUrl = `/api/avatars/${fileId}.${ext}`;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No updates provided" });
      }

      const [updated] = await db.update(users)
        .set(updates)
        .where(eq(users.id, userId))
        .returning();

      return res.json({
        id: updated.id,
        email: updated.email,
        username: updated.username,
        avatarUrl: updated.avatarUrl,
        bio: updated.bio,
      });
    } catch (error) {
      console.error("Profile update error:", error);
      return res.status(500).json({ error: "Failed to update profile" });
    }
  });

  app.get("/api/avatars/:fileName", (req, res) => {
    const { fileName } = req.params;
    const sanitized = fileName.replace(/[^a-zA-Z0-9.\-]/g, "");
    const filePath = path.join(AVATARS_DIR, sanitized);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Avatar not found" });
    }

    const ext = path.extname(sanitized).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : "image/jpeg";
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=31536000");
    res.set("Access-Control-Allow-Origin", "*");
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });

  app.get("/api/vibes", (_req, res) => {
    return res.json(AVAILABLE_VIBES.map(v => ({ id: v.id, label: v.label })));
  });

  app.get("/api/vibes/:vibeId/audio", (req, res) => {
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
  });

  app.post("/api/solos", upload.single("audio"), async (req, res) => {
    const userId = await requireAuth(req, res);
    if (!userId) return;

    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      const { title, durationMs, tags, trimStartMs, trimEndMs } = req.body;
      if (!title) {
        return res.status(400).json({ error: "title is required" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || !user.username) {
        return res.status(400).json({ error: "Complete your profile setup first" });
      }

      let audioData = file.buffer;
      const trimStart = trimStartMs ? parseFloat(trimStartMs) / 1000 : null;
      const trimEnd = trimEndMs ? parseFloat(trimEndMs) / 1000 : null;
      if (trimStart !== null && trimEnd !== null && trimEnd > trimStart) {
        audioData = await trimAudio(Buffer.from(audioData), trimStart, trimEnd);
      }

      const { vibeId } = req.body;
      if (vibeId && typeof vibeId === "string") {
        audioData = await mixVibeIntoAudio(Buffer.from(audioData), vibeId);
      }

      const fileId = randomUUID();
      const fileName = `${fileId}.m4a`;
      const filePath = path.join(UPLOADS_DIR, fileName);
      fs.writeFileSync(filePath, audioData);

      const audioUrl = `/api/audio/${fileId}`;
      const parsedTags = tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : [];

      const [solo] = await db.insert(solos).values({
        userId: user.id,
        username: user.username,
        audioUrl,
        tags: parsedTags,
        avatarUrl: user.avatarUrl || null,
        title,
        durationMs: parseInt(durationMs) || 0,
        displayName: user.username,
      }).returning();

      generateTranscript(solo.id, filePath, solo.durationMs).catch(err => {
        console.error("Background transcription failed:", err);
      });

      return res.status(201).json(solo);
    } catch (error) {
      console.error("Error creating solo:", error);
      return res.status(500).json({ error: "Failed to create solo" });
    }
  });

  app.get("/api/solos", async (req, res) => {
    try {
      const tag = req.query.tag as string | undefined;

      const baseQuery = db.select().from(solos);
      const latestSolos = tag
        ? await baseQuery.where(sql`${tag} = ANY(${solos.tags})`).orderBy(desc(solos.timestamp)).limit(50)
        : await baseQuery.orderBy(desc(solos.timestamp)).limit(50);
      return res.json(latestSolos);
    } catch (error) {
      console.error("Error fetching solos:", error);
      return res.status(500).json({ error: "Failed to fetch solos" });
    }
  });

  app.delete("/api/solos/:soloId", async (req, res) => {
    const userId = await requireAuth(req, res);
    if (!userId) return;

    try {
      const { soloId } = req.params;
      const [solo] = await db.select().from(solos).where(eq(solos.id, soloId)).limit(1);
      if (!solo) {
        return res.status(404).json({ error: "Solo not found" });
      }
      if (solo.userId !== userId) {
        return res.status(403).json({ error: "You can only delete your own solos" });
      }

      const audioFileId = solo.audioUrl.replace("/api/audio/", "");
      const filePath = path.join(UPLOADS_DIR, `${audioFileId}.m4a`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      await db.delete(solos).where(eq(solos.id, soloId));
      return res.json({ success: true });
    } catch (error) {
      console.error("Error deleting solo:", error);
      return res.status(500).json({ error: "Failed to delete solo" });
    }
  });

  app.put("/api/solos/:soloId", async (req, res) => {
    const userId = await requireAuth(req, res);
    if (!userId) return;

    try {
      const { soloId } = req.params;
      const [solo] = await db.select().from(solos).where(eq(solos.id, soloId)).limit(1);
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

      const [updated] = await db
        .update(solos)
        .set(updates)
        .where(eq(solos.id, soloId))
        .returning();

      return res.json(updated);
    } catch (error) {
      console.error("Error updating solo:", error);
      return res.status(500).json({ error: "Failed to update solo" });
    }
  });

  app.get("/api/solos/user/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const userSolos = await db
        .select()
        .from(solos)
        .where(eq(solos.userId, userId))
        .orderBy(desc(solos.timestamp));

      return res.json(userSolos);
    } catch (error) {
      console.error("Error fetching user solos:", error);
      return res.status(500).json({ error: "Failed to fetch user solos" });
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

  app.post("/api/solos/:soloId/transcribe", async (req, res) => {
    const userId = await requireAuth(req, res);
    if (!userId) return;

    try {
      const { soloId } = req.params;
      const [solo] = await db.select().from(solos).where(eq(solos.id, soloId)).limit(1);
      if (!solo) {
        return res.status(404).json({ error: "Solo not found" });
      }

      if (solo.transcript) {
        return res.json({ transcript: solo.transcript });
      }

      const fileId = solo.audioUrl.replace('/api/audio/', '');
      const sanitized = fileId.replace(/[^a-zA-Z0-9\-]/g, "");
      const filePath = path.join(UPLOADS_DIR, `${sanitized}.m4a`);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Audio file not found" });
      }

      const transcript = await generateTranscript(soloId, filePath, solo.durationMs);
      if (!transcript) {
        return res.status(500).json({ error: "Failed to transcribe audio" });
      }

      return res.json({ transcript });
    } catch (error) {
      console.error("Transcription error:", error);
      return res.status(500).json({ error: "Failed to transcribe audio" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
