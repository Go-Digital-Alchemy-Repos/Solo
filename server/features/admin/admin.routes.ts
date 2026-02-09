import { Router } from "express";
import * as adminController from "./admin.controller";
import { asyncHandler } from "../../middleware/errorHandler";

const router = Router();

router.post("/login", asyncHandler(adminController.login));
router.get("/me", asyncHandler(adminController.me));
router.post("/logout", adminController.logout);
router.get("/stats", asyncHandler(adminController.stats));
router.get("/users", asyncHandler(adminController.listUsers));
router.put("/users/:userId", asyncHandler(adminController.updateUser));
router.delete("/users/:userId", asyncHandler(adminController.deleteUser));
router.get("/docs", asyncHandler(adminController.listDocs));
router.get("/docs/coverage", asyncHandler(adminController.docsCoverage));
router.get("/docs/:docPath", asyncHandler(adminController.readDoc));
router.post("/docs/sync", asyncHandler(adminController.syncDocs));

export default router;
