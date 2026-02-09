import { Router } from "express";
import * as vibesController from "./vibes.controller";

const router = Router();

router.get("/", vibesController.list);
router.get("/:vibeId/audio", vibesController.streamAudio);

export default router;
