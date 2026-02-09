import { Router } from "express";
import multer from "multer";
import * as solosController from "./solos.controller";
import { asyncHandler } from "../../middleware/errorHandler";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post("/", upload.single("audio"), asyncHandler(solosController.create));
router.get("/", asyncHandler(solosController.list));
router.get("/:soloId/status", asyncHandler(solosController.getStatus));
router.post("/:soloId/retry", asyncHandler(solosController.retry));
router.delete("/:soloId", asyncHandler(solosController.remove));
router.put("/:soloId", asyncHandler(solosController.update));
router.get("/user/:userId", asyncHandler(solosController.userSolos));
router.post("/:soloId/transcribe", asyncHandler(solosController.transcribe));

export default router;
