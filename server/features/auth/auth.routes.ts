import { Router } from "express";
import multer from "multer";
import * as authController from "./auth.controller";
import { asyncHandler } from "../../middleware/errorHandler";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post("/signup", asyncHandler(authController.signup));
router.post("/login", asyncHandler(authController.login));
router.post("/logout", authController.logout);
router.get("/me", asyncHandler(authController.me));
router.put("/profile", upload.single("avatar"), asyncHandler(authController.updateProfile));

export default router;
