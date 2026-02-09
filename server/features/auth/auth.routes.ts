import { Router } from "express";
import multer from "multer";
import * as authController from "./auth.controller";
import { asyncHandler } from "../../middleware/errorHandler";
import { AppError } from "../../lib/errors";
import { resetPasswordWithToken } from "../admin/userManagement.service";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post("/signup", asyncHandler(authController.signup));
router.post("/login", asyncHandler(authController.login));
router.post("/logout", authController.logout);
router.get("/me", asyncHandler(authController.me));
router.put("/profile", upload.single("avatar"), asyncHandler(authController.updateProfile));

router.post("/reset-password", asyncHandler(async (req, res) => {
  const { userId, token, newPassword } = req.body || {};

  if (!userId || !token || !newPassword) {
    throw AppError.badRequest("userId, token, and newPassword are required");
  }

  const result = await resetPasswordWithToken(userId, token, newPassword);

  if ("error" in result) {
    if (result.error === "PASSWORD_TOO_SHORT") {
      throw AppError.validationFailed({ newPassword: ["Password must be at least 8 characters"] });
    }
    if (result.error === "INVALID_OR_EXPIRED_TOKEN") {
      throw AppError.badRequest("Invalid or expired reset link");
    }
  }

  return res.json({ ok: true });
}));

export default router;
