import { Router } from "express";
import * as adminController from "./admin.controller";
import { asyncHandler } from "../../middleware/errorHandler";
import systemStatusRoutes from "./systemStatus.routes";
import userManagementRoutes from "./userManagement.routes";

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

router.get("/integrations", asyncHandler(adminController.getIntegrations));
router.put("/integrations", asyncHandler(adminController.saveIntegration));
router.post("/integrations/:service/test", asyncHandler(adminController.testIntegration));

router.get("/processing-jobs", asyncHandler(adminController.listProcessingJobs));
router.post("/processing-jobs/:soloId/retry", asyncHandler(adminController.retryProcessingJob));
router.post("/processing-jobs/:soloId/fail", asyncHandler(adminController.markJobFailed));
router.post("/processing-jobs/:soloId/reset", asyncHandler(adminController.resetJob));

router.use("/system-status", systemStatusRoutes);
router.use("/user-management", userManagementRoutes);

export default router;
