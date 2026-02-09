import type { Request, Response } from "express";
import * as adminService from "./admin.service";
import { requireAdmin } from "../../utils/auth-helpers";
import { scanAllRoutes, createStubDocument, mergeContent, generateAutoSection } from "../../utils/routeScanner";
import * as fs from "fs";
import * as path from "path";
import { DOCS_DIR } from "../../utils/paths";

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const user = await adminService.findUserByEmail(email);
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = await adminService.verifyPassword(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  if (!user.isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
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
      return res.status(500).json({ error: "Logout failed" });
    }
    res.clearCookie("connect.sid");
    return res.json({ success: true });
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
  const { username, bio, isAdmin } = req.body;

  const updates: any = {};
  if (username !== undefined) updates.username = username;
  if (bio !== undefined) updates.bio = bio;
  if (isAdmin !== undefined) updates.isAdmin = isAdmin;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  const updated = await adminService.updateUser(userId, updates);
  if (!updated) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.json(updated);
}

export async function deleteUser(req: Request, res: Response) {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { userId } = req.params;

  if (userId === adminId) {
    return res.status(400).json({ error: "Cannot delete your own admin account" });
  }

  await adminService.deleteUser(userId);
  return res.json({ success: true });
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
    return res.status(404).json({ error: "Document not found" });
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

  return res.json({ success: true, summary, details });
}
