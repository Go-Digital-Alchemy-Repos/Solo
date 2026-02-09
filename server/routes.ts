import type { Express } from "express";
import { createServer, type Server } from "node:http";
import * as fs from "fs";
import * as path from "path";

import authRoutes from "./features/auth/auth.routes";
import solosRoutes from "./features/solos/solos.routes";
import vibesRoutes from "./features/vibes/vibes.routes";
import adminRoutes from "./features/admin/admin.routes";
import { streamAudio, audioOptions } from "./features/solos/solos.controller";
import { serveAvatar } from "./features/auth/auth.controller";
import { logger } from "./lib/logger";
import { eventLogger } from "./lib/eventLogger";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

const clientErrors: Array<{ timestamp: string; message: string; platform: string; stack?: string }> = [];
const MAX_CLIENT_ERRORS = 100;

export async function registerRoutes(app: Express): Promise<Server> {

  app.use("/api/auth", authRoutes);
  app.use("/api/solos", solosRoutes);
  app.use("/api/vibes", vibesRoutes);
  app.use("/api/admin", adminRoutes);

  app.get("/api/audio/:fileId", streamAudio);
  app.head("/api/audio/:fileId", streamAudio);
  app.options("/api/audio/:fileId", audioOptions);
  app.get("/api/avatars/:fileName", serveAvatar);

  app.post("/api/telemetry/error", (req, res) => {
    const { message, stack, platform, componentStack, screen } = req.body || {};
    if (!message) {
      return res.status(400).json({ ok: false });
    }

    const entry = {
      timestamp: new Date().toISOString(),
      message: String(message).slice(0, 500),
      platform: String(platform || "unknown"),
      stack: stack ? String(stack).slice(0, 1000) : undefined,
      screen: screen || undefined,
    };

    clientErrors.unshift(entry);
    if (clientErrors.length > MAX_CLIENT_ERRORS) {
      clientErrors.length = MAX_CLIENT_ERRORS;
    }

    logger.warn(`Client error: ${entry.message}`, {
      error: entry.stack?.split("\n")[0],
    });

    eventLogger.error("client", "client_error", entry.message, {
      platform: entry.platform,
      stack: entry.stack,
      screen,
      componentStack: componentStack ? String(componentStack).slice(0, 500) : undefined,
    }, {
      requestId: req.requestId,
      userId: req.session?.userId,
    });

    return res.json({ ok: true });
  });

  app.get("/api/admin/client-errors", async (req, res) => {
    const { requireAdmin } = await import("./utils/auth-helpers");
    try {
      await requireAdmin(req, res);
    } catch {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    return res.json({ errors: clientErrors, count: clientErrors.length });
  });

  const adminTemplatePath = path.resolve(process.cwd(), "server", "templates", "admin.html");
  app.get("/admin", (req, res) => {
    const html = fs.readFileSync(adminTemplatePath, "utf-8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  });

  const httpServer = createServer(app);
  return httpServer;
}
