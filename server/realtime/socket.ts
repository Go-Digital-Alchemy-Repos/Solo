import { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, Socket } from "socket.io";
import type { IncomingMessage } from "node:http";
import { parse as parseCookie } from "cookie";
import cookieSignature from "cookie-signature";
import { logger } from "../lib/logger";
import * as dmService from "../features/dm/dm.service";

let io: SocketIOServer | null = null;

export function getIO(): SocketIOServer | null {
  return io;
}

export function setupSocketServer(httpServer: HttpServer, sessionStore: any) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
    path: "/socket.io",
    transports: ["websocket", "polling"],
  });

  io.use(async (socket, next) => {
    try {
      const userId = await authenticateSocket(socket, sessionStore);
      if (!userId) {
        return next(new Error("Authentication required"));
      }
      (socket as any).userId = userId;
      next();
    } catch (err) {
      logger.warn("Socket auth failed", { error: err instanceof Error ? err.message : String(err) });
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const userId = (socket as any).userId as string;
    if (!userId) return socket.disconnect();

    socket.join(`user:${userId}`);
    dmService.updatePresence(userId, "online").catch(() => {});

    io!.emit("dm:presence", { userId, status: "online", lastSeenAt: new Date().toISOString() });

    logger.info(`Socket connected: ${userId}`, { socketId: socket.id });

    socket.on("dm:join_conversation", async (data: { conversationId: string }) => {
      try {
        const isMember = await dmService.isParticipant(data.conversationId, userId);
        if (!isMember) {
          socket.emit("dm:error", { code: "FORBIDDEN", message: "Not a participant" });
          return;
        }
        socket.join(`conv:${data.conversationId}`);
      } catch (err) {
        socket.emit("dm:error", { code: "ERROR", message: "Failed to join conversation" });
      }
    });

    socket.on("dm:leave_conversation", (data: { conversationId: string }) => {
      socket.leave(`conv:${data.conversationId}`);
    });

    socket.on("dm:send_message", async (data: {
      conversationId: string;
      type: string;
      text?: string;
      mediaUrl?: string;
      mediaMeta?: any;
      clientNonce?: string;
    }, ack?: (response: any) => void) => {
      try {
        const isMember = await dmService.isParticipant(data.conversationId, userId);
        if (!isMember) {
          if (ack) ack({ ok: false, error: { code: "FORBIDDEN", message: "Not a participant" } });
          return;
        }

        if (data.type === "text" && (!data.text || !data.text.trim())) {
          if (ack) ack({ ok: false, error: { code: "INVALID", message: "Text required" } });
          return;
        }

        const result = await dmService.sendMessage({
          conversationId: data.conversationId,
          senderId: userId,
          type: data.type || "text",
          text: data.text?.trim(),
          mediaUrl: data.mediaUrl,
          mediaMeta: data.mediaMeta,
          clientNonce: data.clientNonce,
        });

        io!.to(`conv:${data.conversationId}`).emit("dm:message_created", {
          conversationId: data.conversationId,
          message: result.message,
        });

        const participantIds = await dmService.getConversationParticipantIds(data.conversationId);
        for (const pid of participantIds) {
          if (pid !== userId) {
            io!.to(`user:${pid}`).emit("dm:conversation_updated", {
              conversationId: data.conversationId,
              lastMessageAt: result.message.createdAt,
              lastMessagePreview: data.type === "text" ? (data.text || "").slice(0, 100) : "Sent a message",
            });
          }
        }

        if (ack) ack({ ok: true, message: result.message });
      } catch (err) {
        logger.error("Socket send_message error", { error: err instanceof Error ? err.message : String(err) });
        if (ack) ack({ ok: false, error: { code: "ERROR", message: "Failed to send" } });
      }
    });

    socket.on("dm:typing", async (data: { conversationId: string; isTyping: boolean }) => {
      try {
        const isMember = await dmService.isParticipant(data.conversationId, userId);
        if (!isMember) return;
        socket.to(`conv:${data.conversationId}`).emit("dm:typing", {
          conversationId: data.conversationId,
          userId,
          isTyping: data.isTyping,
        });
      } catch {}
    });

    socket.on("dm:mark_read", async (data: { conversationId: string; messageId: string }) => {
      try {
        const isMember = await dmService.isParticipant(data.conversationId, userId);
        if (!isMember) return;
        await dmService.markRead(data.conversationId, userId, data.messageId);
        socket.to(`conv:${data.conversationId}`).emit("dm:read_receipt", {
          conversationId: data.conversationId,
          userId,
          messageId: data.messageId,
          readAt: new Date().toISOString(),
        });
      } catch {}
    });

    socket.on("disconnect", () => {
      dmService.updatePresence(userId, "offline").catch(() => {});
      io!.emit("dm:presence", { userId, status: "offline", lastSeenAt: new Date().toISOString() });
      logger.info(`Socket disconnected: ${userId}`, { socketId: socket.id });
    });
  });

  return io;
}

async function authenticateSocket(socket: Socket, sessionStore: any): Promise<string | null> {
  const req = socket.request as IncomingMessage;
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  const cookies = parseCookie(cookieHeader);
  let sid = cookies["connect.sid"];
  if (!sid) return null;

  sid = decodeURIComponent(sid);
  if (sid.startsWith("s:")) {
    sid = sid.slice(2);
  }

  const secret = process.env.SESSION_SECRET || "solo-secret-fallback";
  const unsigned = cookieSignature.unsign(sid, secret);
  if (unsigned === false) return null;

  return new Promise<string | null>((resolve) => {
    sessionStore.get(unsigned as string, (err: any, session: any) => {
      if (err || !session?.userId) {
        resolve(null);
      } else {
        resolve(session.userId);
      }
    });
  });
}
