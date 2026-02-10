import { Router, type Request, type Response } from "express";
import { requireAuth } from "../../utils/auth-helpers";
import { asyncHandler } from "../../middleware/errorHandler";
import { AppError } from "../../lib/errors";
import * as dmService from "./dm.service";

const router = Router();

router.get("/conversations", asyncHandler(async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const conversations = await dmService.getUserConversations(userId);
  return res.json({ ok: true, data: conversations });
}));

router.post("/conversations/direct", asyncHandler(async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { userId: targetUserId } = req.body || {};
  if (!targetUserId || typeof targetUserId !== "string") {
    throw AppError.badRequest("userId is required");
  }
  if (targetUserId === userId) {
    throw AppError.badRequest("Cannot start a conversation with yourself");
  }

  const result = await dmService.getOrCreateDirectConversation(userId, targetUserId);
  return res.json({ ok: true, data: result });
}));

router.get("/conversations/:id/messages", asyncHandler(async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const conversationId = req.params.id;
  const isMember = await dmService.isParticipant(conversationId, userId);
  if (!isMember) throw AppError.forbidden("Not a participant");

  const cursor = req.query.cursor as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string) || 30, 50);

  const result = await dmService.getConversationMessages(conversationId, cursor, limit);
  return res.json({ ok: true, data: result });
}));

router.post("/conversations/:id/messages", asyncHandler(async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const conversationId = req.params.id;
  const isMember = await dmService.isParticipant(conversationId, userId);
  if (!isMember) throw AppError.forbidden("Not a participant");

  const { type, text, mediaUrl, mediaMeta, clientNonce } = req.body || {};

  if (!type || !["text", "image", "audio"].includes(type)) {
    throw AppError.badRequest("Valid message type required");
  }
  if (type === "text" && (!text || typeof text !== "string" || !text.trim())) {
    throw AppError.badRequest("Text content required for text messages");
  }

  const result = await dmService.sendMessage({
    conversationId,
    senderId: userId,
    type,
    text: text?.trim(),
    mediaUrl,
    mediaMeta,
    clientNonce,
  });

  return res.json({ ok: true, data: result.message, duplicate: result.duplicate });
}));

router.post("/messages/:id/read", asyncHandler(async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const messageId = req.params.id;
  const { conversationId } = req.body || {};

  if (!conversationId) {
    throw AppError.badRequest("conversationId is required");
  }

  const isMember = await dmService.isParticipant(conversationId, userId);
  if (!isMember) throw AppError.forbidden("Not a participant");

  await dmService.markRead(conversationId, userId, messageId);
  return res.json({ ok: true });
}));

router.post("/messages/:id/delete", asyncHandler(async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const result = await dmService.deleteMessage(req.params.id, userId);
  if ("error" in result) {
    if (result.error === "NOT_FOUND") throw AppError.notFound("Message not found");
    if (result.error === "FORBIDDEN") throw AppError.forbidden("Can only delete your own messages");
  }

  return res.json({ ok: true });
}));

router.get("/users/search", asyncHandler(async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const query = (req.query.q as string) || "";
  const results = await dmService.searchUsers(query, userId);
  return res.json({ ok: true, data: results });
}));

router.get("/presence", asyncHandler(async (req: Request, res: Response) => {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  const userIds = ((req.query.userIds as string) || "").split(",").filter(Boolean);
  if (userIds.length === 0) return res.json({ ok: true, data: {} });

  const presence = await dmService.getPresence(userIds);
  return res.json({ ok: true, data: presence });
}));

export default router;
