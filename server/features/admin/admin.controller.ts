import type { Request, Response } from "express";
import * as adminService from "./admin.service";
import * as integrationsService from "./integrations.service";
import { requireAdmin } from "../../utils/auth-helpers";
import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { scanAllRoutes, createStubDocument, mergeContent, generateAutoSection } from "../../utils/routeScanner";
import { db } from "../../db";
import { solos } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { DOCS_DIR } from "../../utils/paths";

export async function login(req: Request, res: Response) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    throw AppError.badRequest("Email and password required");
  }

  const user = await adminService.findUserByEmail(email);
  if (!user) {
    throw AppError.unauthorized("Invalid credentials");
  }

  const valid = await adminService.verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw AppError.unauthorized("Invalid credentials");
  }

  if (!user.isAdmin) {
    throw AppError.forbidden("Admin access required");
  }

  req.session.userId = user.id;
  return res.json({
    id: user.id,
    email: user.email,
    username: user.username,
    isAdmin: user.isAdmin,
  });
}

export async function me(req: Request, res: Response) {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const user = await adminService.findUserById(userId);
  return res.json({
    id: user!.id,
    email: user!.email,
    username: user!.username,
    isAdmin: user!.isAdmin,
  });
}

export function logout(req: Request, res: Response) {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Logout failed" } });
    }
    res.clearCookie("connect.sid");
    return res.json({ ok: true });
  });
}

export async function stats(req: Request, res: Response) {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const result = await adminService.getStats();
  return res.json(result);
}

export async function listUsers(req: Request, res: Response) {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 25;
  const search = (req.query.search as string) || "";

  const result = await adminService.listUsers(page, limit, search);
  return res.json(result);
}

export async function updateUser(req: Request, res: Response) {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { userId } = req.params;
  const { username, bio, isAdmin } = req.body || {};

  const updates: any = {};
  if (username !== undefined) updates.username = username;
  if (bio !== undefined) updates.bio = bio;
  if (isAdmin !== undefined) updates.isAdmin = isAdmin;

  if (Object.keys(updates).length === 0) {
    throw AppError.badRequest("No fields to update");
  }

  const updated = await adminService.updateUser(userId, updates);
  if (!updated) {
    throw AppError.notFound("User not found");
  }

  return res.json(updated);
}

export async function deleteUser(req: Request, res: Response) {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { userId } = req.params;

  if (userId === adminId) {
    throw AppError.badRequest("Cannot delete your own admin account");
  }

  await adminService.deleteUser(userId);
  return res.json({ ok: true });
}

export async function listDocs(req: Request, res: Response) {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const result = adminService.scanDocsDirectory();
  return res.json(result);
}

export async function docsCoverage(req: Request, res: Response) {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const allRoutes = scanAllRoutes();
  const apiRegistryDir = path.join(DOCS_DIR, "17-API-REGISTRY");

  const apiDomains: any[] = [];
  let apiWithDocs = 0;
  let apiWithAuth = 0;
  let apiWithExamples = 0;

  for (const [domain, domainRoutes] of allRoutes) {
    const docFile = path.join(apiRegistryDir, `${domain.toUpperCase()}.md`);
    const hasDoc = fs.existsSync(docFile);
    let hasAuth = false;
    let hasExamples = false;

    if (hasDoc) {
      const content = fs.readFileSync(docFile, "utf-8");
      hasAuth = content.includes("Auth Required") && !content.includes("TBD");
      hasExamples = /```(json|typescript|ts|javascript|js)/i.test(content);
      apiWithDocs++;
      if (hasAuth) apiWithAuth++;
      if (hasExamples) apiWithExamples++;
    }

    apiDomains.push({
      domain,
      displayName: domainRoutes.displayName,
      endpointCount: domainRoutes.routes.length,
      hasDoc,
      hasAuth,
      hasExamples,
    });
  }

  const requiredFunctionalDocs = [
    { id: "USER_AUTHENTICATION", name: "User Authentication" },
    { id: "AUDIO_RECORDING", name: "Audio Recording" },
    { id: "FEED_PLAYBACK", name: "Feed & Playback" },
    { id: "USER_PROFILES", name: "User Profiles" },
    { id: "ADMIN_PORTAL", name: "Admin Portal" },
  ];

  const functionalDocsDir = path.join(DOCS_DIR, "18-FUNCTIONAL-DOCS");
  const functionalDocs: any[] = [];
  let funcWithDocs = 0;

  for (const reqDoc of requiredFunctionalDocs) {
    const docFile = path.join(functionalDocsDir, `${reqDoc.id}.md`);
    const exists = fs.existsSync(docFile);
    let wordCount = 0;
    let isEmpty = true;

    if (exists) {
      const content = fs.readFileSync(docFile, "utf-8");
      wordCount = content.split(/\s+/).filter(Boolean).length;
      isEmpty = wordCount < 100;
      if (!isEmpty) funcWithDocs++;
    }

    functionalDocs.push({
      id: reqDoc.id,
      name: reqDoc.name,
      exists,
      isEmpty,
      wordCount,
    });
  }

  const totalApiDomains = allRoutes.size || 1;
  const totalFunctional = requiredFunctionalDocs.length || 1;

  return res.json({
    api: {
      total: allRoutes.size,
      withDocs: apiWithDocs,
      withAuth: apiWithAuth,
      withExamples: apiWithExamples,
      coveragePercent: Math.round((apiWithDocs / totalApiDomains) * 100),
      domains: apiDomains,
    },
    functional: {
      total: requiredFunctionalDocs.length,
      withDocs: funcWithDocs,
      coveragePercent: Math.round((funcWithDocs / totalFunctional) * 100),
      docs: functionalDocs,
    },
  });
}

export async function readDoc(req: Request, res: Response) {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const docPath = req.params.docPath;
  const doc = adminService.readDoc(docPath);

  if (!doc) {
    throw AppError.notFound("Document not found");
  }

  return res.json(doc);
}

export async function syncDocs(req: Request, res: Response) {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const allRoutes = scanAllRoutes();
  const registryDir = path.join(DOCS_DIR, "17-API-REGISTRY");
  if (!fs.existsSync(registryDir)) {
    fs.mkdirSync(registryDir, { recursive: true });
  }

  const summary = { created: 0, updated: 0, skipped: 0, errors: 0 };
  const details: any[] = [];

  for (const [domain, domainRoutes] of allRoutes) {
    const fileName = `${domain.toUpperCase()}.md`;
    const filePath = path.join(registryDir, fileName);

    try {
      if (fs.existsSync(filePath)) {
        const existing = fs.readFileSync(filePath, "utf-8");
        const autoSection = generateAutoSection(domainRoutes);
        const merged = mergeContent(existing, autoSection);
        fs.writeFileSync(filePath, merged, "utf-8");
        summary.updated++;
        details.push({ domain, file: fileName, action: "updated" });
      } else {
        const stub = createStubDocument(domainRoutes);
        fs.writeFileSync(filePath, stub, "utf-8");
        summary.created++;
        details.push({ domain, file: fileName, action: "created" });
      }
    } catch (err: any) {
      summary.errors++;
      details.push({ domain, file: fileName, action: "error", error: err.message });
    }
  }

  return res.json({ ok: true, summary, details });
}

export async function getIntegrations(req: Request, res: Response) {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const integrations = await integrationsService.getAllIntegrations();
  return res.json(integrations);
}

export async function saveIntegration(req: Request, res: Response) {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const { service, config, enabled } = req.body || {};
  const validServices: integrationsService.ServiceName[] = ["mailgun", "cloudflare_r2", "twilio"];

  if (!validServices.includes(service)) {
    throw AppError.validationFailed({ service: ["Invalid service name. Must be one of: mailgun, cloudflare_r2, twilio"] });
  }

  const result = await integrationsService.saveIntegration(service, config, enabled ?? false);
  return res.json({ ok: true, integration: result });
}

export async function testIntegration(req: Request, res: Response) {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const { service } = req.params;
  const validServices: integrationsService.ServiceName[] = ["mailgun", "cloudflare_r2", "twilio"];

  if (!validServices.includes(service as integrationsService.ServiceName)) {
    throw AppError.validationFailed({ service: ["Invalid service name. Must be one of: mailgun, cloudflare_r2, twilio"] });
  }

  const result = await integrationsService.testIntegration(service as integrationsService.ServiceName);
  return res.json(result);
}

export async function listProcessingJobs(req: Request, res: Response) {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const statusFilter = req.query.status as string | undefined;

  let query = db
    .select({
      id: solos.id,
      userId: solos.userId,
      username: solos.username,
      title: solos.title,
      status: solos.status,
      processingStep: solos.processingStep,
      processingError: solos.processingError,
      attempts: solos.attempts,
      durationMs: solos.durationMs,
      createdAt: solos.createdAt,
      updatedAt: solos.updatedAt,
      readyAt: solos.readyAt,
    })
    .from(solos)
    .orderBy(desc(solos.updatedAt))
    .limit(limit);

  if (statusFilter && ['queued', 'processing', 'ready', 'failed'].includes(statusFilter)) {
    query = query.where(eq(solos.status, statusFilter));
  }

  const jobs = await query;

  const counts = await db
    .select({
      status: solos.status,
      count: sql<number>`count(*)::int`,
    })
    .from(solos)
    .groupBy(solos.status);

  const summary: Record<string, number> = {};
  for (const row of counts) {
    summary[row.status] = row.count;
  }

  return res.json({ jobs, summary });
}

export async function retryProcessingJob(req: Request, res: Response) {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { soloId } = req.params;

  const [solo] = await db.select().from(solos).where(eq(solos.id, soloId)).limit(1);
  if (!solo) {
    throw AppError.notFound("Solo not found");
  }
  if (solo.status !== 'failed') {
    throw AppError.badRequest(`Solo is in '${solo.status}' state, only 'failed' jobs can be retried`);
  }
  if (solo.attempts >= 5) {
    throw AppError.badRequest(`Solo has exceeded max retry attempts (${solo.attempts})`);
  }

  await db.update(solos).set({
    status: 'queued',
    processingStep: 'upload',
    processingError: null,
    attempts: solo.attempts + 1,
    lastAttemptAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(solos.id, soloId));

  logger.info(`Admin retry: solo ${soloId} (attempt ${solo.attempts + 1})`, { soloId });

  return res.json({ ok: true, soloId, newAttempt: solo.attempts + 1 });
}

export async function markJobFailed(req: Request, res: Response) {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { soloId } = req.params;
  const { reason } = req.body || {};

  const [solo] = await db.select().from(solos).where(eq(solos.id, soloId)).limit(1);
  if (!solo) {
    throw AppError.notFound("Solo not found");
  }
  if (solo.status === 'ready') {
    throw AppError.badRequest("Cannot mark a completed solo as failed");
  }

  const errorMsg = reason || 'Manually marked as failed by admin';

  await db.update(solos).set({
    status: 'failed',
    processingError: errorMsg,
    updatedAt: new Date(),
  }).where(eq(solos.id, soloId));

  logger.info(`Admin mark-failed: solo ${soloId}`, { soloId });

  return res.json({ ok: true, soloId, status: 'failed' });
}

export async function resetJob(req: Request, res: Response) {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { soloId } = req.params;

  const [solo] = await db.select().from(solos).where(eq(solos.id, soloId)).limit(1);
  if (!solo) {
    throw AppError.notFound("Solo not found");
  }

  await db.update(solos).set({
    status: 'queued',
    processingStep: 'upload',
    processingError: null,
    attempts: 0,
    updatedAt: new Date(),
  }).where(eq(solos.id, soloId));

  logger.info(`Admin reset: solo ${soloId}`, { soloId });

  return res.json({ ok: true, soloId, status: 'queued', attempts: 0 });
}
