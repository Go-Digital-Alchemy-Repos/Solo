import type { Request, Response } from "express";
import * as authService from "./auth.service";
import { requireAuth, getSessionCookie } from "../../utils/auth-helpers";
import { AppError } from "../../lib/errors";
import * as fs from "fs";
import * as path from "path";
import { AVATARS_DIR } from "../../utils/paths";

export async function signup(req: Request, res: Response) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    throw AppError.badRequest("Email and password are required");
  }
  if (password.length < 6) {
    throw AppError.validationFailed({ password: ["Password must be at least 6 characters"] });
  }
  const emailLower = email.toLowerCase().trim();

  const existing = await authService.findUserByEmail(emailLower);
  if (existing) {
    throw AppError.conflict("An account with this email already exists");
  }

  const user = await authService.createUser(emailLower, password);

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
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    throw AppError.badRequest("Email and password are required");
  }
  const emailLower = email.toLowerCase().trim();

  const user = await authService.findUserByEmail(emailLower);
  if (!user) {
    throw AppError.unauthorized("Invalid email or password");
  }

  const valid = await authService.verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw AppError.unauthorized("Invalid email or password");
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
}

export function logout(req: Request, res: Response) {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Failed to log out" } });
    }
    res.clearCookie("connect.sid");
    return res.json({ ok: true });
  });
}

export async function me(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const user = await authService.findUserById(userId);
  if (!user) {
    req.session?.destroy(() => {});
    throw AppError.unauthorized("User not found");
  }
  return res.json({
    id: user.id,
    email: user.email,
    username: user.username,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    isAdmin: user.isAdmin ?? false,
    createdAt: user.createdAt,
  });
}

export async function updateProfile(req: Request, res: Response) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { username, bio } = req.body;
  const updates: Record<string, unknown> = {};

  if (username) {
    const usernameLower = username.toLowerCase().trim();
    if (!/^[a-z0-9_]{3,20}$/.test(usernameLower)) {
      throw AppError.validationFailed({ username: ["Username must be 3-20 characters, only letters, numbers, and underscores"] });
    }
    const available = await authService.checkUsernameAvailable(usernameLower, userId);
    if (!available) {
      throw AppError.conflict("Username is already taken");
    }
    updates.username = usernameLower;
  }

  if (bio !== undefined) {
    updates.bio = bio.trim().slice(0, 160);
  }

  if (req.file) {
    updates.avatarUrl = authService.saveAvatarFile(req.file.buffer, req.file.mimetype);
  }

  if (Object.keys(updates).length === 0) {
    throw AppError.badRequest("No updates provided");
  }

  const updated = await authService.updateProfile(userId, updates);

  return res.json({
    id: updated.id,
    email: updated.email,
    username: updated.username,
    avatarUrl: updated.avatarUrl,
    bio: updated.bio,
  });
}

export function serveAvatar(req: Request, res: Response) {
  const { fileName } = req.params;
  const sanitized = fileName.replace(/[^a-zA-Z0-9.\-]/g, "");
  const filePath = path.join(AVATARS_DIR, sanitized);

  if (!fs.existsSync(filePath)) {
    throw AppError.notFound("Avatar not found");
  }

  const ext = path.extname(sanitized).toLowerCase();
  const contentType = ext === ".png" ? "image/png" : "image/jpeg";
  res.set("Content-Type", contentType);
  res.set("Cache-Control", "public, max-age=31536000");
  res.set("Access-Control-Allow-Origin", "*");
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
}
