import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import multer from "multer";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { solos, users } from "@shared/schema";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads", "solos");
const AVATARS_DIR = path.resolve(process.cwd(), "uploads", "avatars");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(AVATARS_DIR)) {
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

async function requireAuth(req: Request, res: Response): Promise<string | null> {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  return userId;
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
      return res.status(201).json({
        id: user.id,
        email: user.email,
        username: user.username,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
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
      return res.json({
        id: user.id,
        email: user.email,
        username: user.username,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
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

  app.post("/api/solos", upload.single("audio"), async (req, res) => {
    const userId = await requireAuth(req, res);
    if (!userId) return;

    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      const { title, durationMs, tags } = req.body;
      if (!title) {
        return res.status(400).json({ error: "title is required" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || !user.username) {
        return res.status(400).json({ error: "Complete your profile setup first" });
      }

      const fileId = randomUUID();
      const fileName = `${fileId}.m4a`;
      const filePath = path.join(UPLOADS_DIR, fileName);
      fs.writeFileSync(filePath, file.buffer);

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
