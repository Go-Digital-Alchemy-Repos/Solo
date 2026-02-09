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

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {

  app.use("/api/auth", authRoutes);
  app.use("/api/solos", solosRoutes);
  app.use("/api/vibes", vibesRoutes);
  app.use("/api/admin", adminRoutes);

  app.get("/api/audio/:fileId", streamAudio);
  app.head("/api/audio/:fileId", streamAudio);
  app.options("/api/audio/:fileId", audioOptions);
  app.get("/api/avatars/:fileName", serveAvatar);

  const adminTemplatePath = path.resolve(process.cwd(), "server", "templates", "admin.html");
  app.get("/admin", (req, res) => {
    const html = fs.readFileSync(adminTemplatePath, "utf-8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  });

  const httpServer = createServer(app);
  return httpServer;
}
