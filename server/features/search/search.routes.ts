import { Router, Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import * as searchService from "./search.service";

const router = Router();

router.get("/users", asyncHandler(async (req: Request, res: Response) => {
  const q = (req.query.q as string || '').trim();
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  const offset = parseInt(req.query.offset as string) || 0;

  if (!q) {
    return res.json({ ok: true, data: { results: [], total: 0 } });
  }

  const data = await searchService.searchUsers(q, limit, offset);
  return res.json({ ok: true, data });
}));

router.get("/solos", asyncHandler(async (req: Request, res: Response) => {
  const q = (req.query.q as string || '').trim();
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  const offset = parseInt(req.query.offset as string) || 0;

  if (!q) {
    return res.json({ ok: true, data: { results: [], total: 0 } });
  }

  const data = await searchService.searchSolos(q, limit, offset);
  return res.json({ ok: true, data });
}));

router.get("/suggestions", asyncHandler(async (req: Request, res: Response) => {
  const q = (req.query.q as string || '').trim();
  const limit = Math.min(parseInt(req.query.limit as string) || 5, 10);

  if (!q) {
    return res.json({ ok: true, data: [] });
  }

  const suggestions = await searchService.getSearchSuggestions(q, limit);
  return res.json({ ok: true, data: suggestions });
}));

router.get("/trending", asyncHandler(async (_req: Request, res: Response) => {
  const users = await searchService.getTrendingUsers(10);
  return res.json({ ok: true, data: users });
}));

router.post("/backfill", asyncHandler(async (_req: Request, res: Response) => {
  const count = await searchService.backfillSearchFields();
  return res.json({ ok: true, data: { backfilled: count } });
}));

export default router;
