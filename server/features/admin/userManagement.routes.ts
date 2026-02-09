import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAdmin } from "../../utils/auth-helpers";
import { asyncHandler } from "../../middleware/errorHandler";
import { AppError } from "../../lib/errors";
import * as umService from "./userManagement.service";

const router = Router();

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10;

function rateLimitSensitive(req: Request, _res: Response, next: NextFunction) {
  const key = `${req.session?.userId || req.ip}:${req.path}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    throw AppError.tooManyRequests("Rate limit exceeded. Try again later.");
  }

  entry.count++;
  return next();
}

router.get("/", asyncHandler(async (req: Request, res: Response) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const query = (req.query.query as string) || "";
  const role = (req.query.role as string) || "";
  const status = (req.query.status as string) || "";
  const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
  const cursor = (req.query.cursor as string) || undefined;

  const result = await umService.listUsersAdvanced({ query, role, status, limit, cursor });
  return res.json({ ok: true, data: result });
}));

router.get("/:id", asyncHandler(async (req: Request, res: Response) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const user = await umService.getUserDetails(req.params.id);
  if (!user) throw AppError.notFound("User not found");

  return res.json({ ok: true, data: user });
}));

router.post("/", rateLimitSensitive, asyncHandler(async (req: Request, res: Response) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { email, username, tempPassword, role, sendInviteResetLink } = req.body || {};

  if (!email || typeof email !== "string" || !email.includes("@")) {
    throw AppError.validationFailed({ email: ["Valid email is required"] });
  }

  const result = await umService.createUser({
    email: email.trim().toLowerCase(),
    username: username?.trim() || undefined,
    tempPassword: tempPassword || undefined,
    role: role || "user",
    adminId,
  });

  if ("error" in result) {
    if (result.error === "EMAIL_EXISTS") {
      throw AppError.conflict("A user with this email already exists");
    }
    if (result.error === "USERNAME_EXISTS") {
      throw AppError.conflict("This username is already taken");
    }
  }

  let resetLink = null;
  if (sendInviteResetLink && "user" in result) {
    const tokenResult = await umService.generateResetToken(result.user.id, adminId);
    if ("token" in tokenResult) {
      resetLink = `/reset-password?userId=${result.user.id}&token=${tokenResult.token}`;
    }
  }

  return res.json({ ok: true, data: { ...(result as any).user, resetLink } });
}));

router.post("/:id/send-reset", rateLimitSensitive, asyncHandler(async (req: Request, res: Response) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const result = await umService.generateResetToken(req.params.id, adminId);

  if ("error" in result) {
    if (result.error === "USER_NOT_FOUND") throw AppError.notFound("User not found");
  }

  const resetLink = `/reset-password?userId=${req.params.id}&token=${result.token}`;

  return res.json({
    ok: true,
    data: {
      resetLink,
      expiresAt: result.expiresAt,
      delivery: "manual",
    },
  });
}));

router.post("/:id/set-password", rateLimitSensitive, asyncHandler(async (req: Request, res: Response) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { newPassword, forceLogout } = req.body || {};

  if (!newPassword || typeof newPassword !== "string") {
    throw AppError.validationFailed({ newPassword: ["Password is required"] });
  }

  const result = await umService.setPassword(req.params.id, newPassword, forceLogout !== false, adminId);

  if ("error" in result) {
    if (result.error === "PASSWORD_TOO_SHORT") {
      throw AppError.validationFailed({ newPassword: ["Password must be at least 8 characters"] });
    }
    if (result.error === "USER_NOT_FOUND") throw AppError.notFound("User not found");
  }

  return res.json({ ok: true });
}));

router.patch("/:id/role", asyncHandler(async (req: Request, res: Response) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { role } = req.body || {};
  if (!role || !["user", "admin"].includes(role.toLowerCase())) {
    throw AppError.validationFailed({ role: ["Role must be 'user' or 'admin'"] });
  }

  const result = await umService.changeRole(req.params.id, role.toLowerCase(), adminId);

  if ("error" in result) {
    if (result.error === "LAST_ADMIN") {
      throw AppError.badRequest("Cannot demote the only admin account");
    }
    if (result.error === "USER_NOT_FOUND") throw AppError.notFound("User not found");
  }

  return res.json({ ok: true, data: result });
}));

router.patch("/:id/status", asyncHandler(async (req: Request, res: Response) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { isDisabled, reason } = req.body || {};
  if (typeof isDisabled !== "boolean") {
    throw AppError.validationFailed({ isDisabled: ["isDisabled must be a boolean"] });
  }

  const result = await umService.setUserStatus(req.params.id, isDisabled, reason, adminId);

  if ("error" in result) {
    if (result.error === "CANNOT_DISABLE_SELF") {
      throw AppError.badRequest("Cannot disable your own account");
    }
    if (result.error === "USER_NOT_FOUND") throw AppError.notFound("User not found");
  }

  return res.json({ ok: true });
}));

router.get("/:id/audit", asyncHandler(async (req: Request, res: Response) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const cursor = (req.query.cursor as string) || undefined;

  const result = await umService.getUserAuditLog(req.params.id, limit, cursor);
  return res.json({ ok: true, data: result });
}));

export default router;
