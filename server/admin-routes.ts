import type { Express, Request, Response } from "express";
import { db } from "./db";
import { users, solos } from "@shared/schema";
import { eq, desc, sql, count, and, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as fs from "fs";
import * as path from "path";
import { scanAllRoutes, createStubDocument, mergeContent, generateAutoSection } from "./utils/routeScanner";

async function requireAdmin(req: Request, res: Response): Promise<string | null> {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }

  return userId;
}

export function registerAdminRoutes(app: Express) {
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }

      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
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
    } catch (error) {
      console.error("Admin login error:", error);
      return res.status(500).json({ error: "Login failed" });
    }
  });

  app.get("/api/admin/me", async (req, res) => {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      isAdmin: user.isAdmin,
    });
  });

  app.post("/api/admin/logout", async (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      return res.json({ success: true });
    });
  });

  app.get("/api/admin/stats", async (req, res) => {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    try {
      const [userCount] = await db.select({ count: count() }).from(users);
      const [soloCount] = await db.select({ count: count() }).from(solos);

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [newUsersToday] = await db
        .select({ count: count() })
        .from(users)
        .where(sql`${users.createdAt} >= ${today}`);

      const [newUsers7d] = await db
        .select({ count: count() })
        .from(users)
        .where(sql`${users.createdAt} >= ${sevenDaysAgo}`);

      const [newUsers30d] = await db
        .select({ count: count() })
        .from(users)
        .where(sql`${users.createdAt} >= ${thirtyDaysAgo}`);

      const [solosToday] = await db
        .select({ count: count() })
        .from(solos)
        .where(sql`${solos.timestamp} >= ${today}`);

      const [solos7d] = await db
        .select({ count: count() })
        .from(solos)
        .where(sql`${solos.timestamp} >= ${sevenDaysAgo}`);

      const [solos30d] = await db
        .select({ count: count() })
        .from(solos)
        .where(sql`${solos.timestamp} >= ${thirtyDaysAgo}`);

      const tagStats = await db
        .select({
          tag: sql<string>`unnest(${solos.tags})`.as("tag"),
          count: count(),
        })
        .from(solos)
        .groupBy(sql`tag`)
        .orderBy(desc(count()));

      const topPosters = await db
        .select({
          userId: solos.userId,
          username: solos.username,
          displayName: solos.displayName,
          count: count(),
        })
        .from(solos)
        .groupBy(solos.userId, solos.username, solos.displayName)
        .orderBy(desc(count()))
        .limit(10);

      const recentSolos = await db
        .select()
        .from(solos)
        .orderBy(desc(solos.timestamp))
        .limit(10);

      const avgDuration = await db
        .select({ avg: sql<number>`COALESCE(AVG(${solos.durationMs}), 0)` })
        .from(solos);

      return res.json({
        totalUsers: userCount.count,
        totalSolos: soloCount.count,
        newUsersToday: newUsersToday.count,
        newUsers7d: newUsers7d.count,
        newUsers30d: newUsers30d.count,
        solosToday: solosToday.count,
        solos7d: solos7d.count,
        solos30d: solos30d.count,
        avgDurationMs: Math.round(Number(avgDuration[0].avg)),
        tagStats,
        topPosters,
        recentSolos,
      });
    } catch (error) {
      console.error("Stats error:", error);
      return res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/admin/users", async (req, res) => {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 25;
      const search = (req.query.search as string) || "";
      const offset = (page - 1) * limit;

      let query = db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
          avatarUrl: users.avatarUrl,
          bio: users.bio,
          isAdmin: users.isAdmin,
          createdAt: users.createdAt,
        })
        .from(users);

      let countQuery = db.select({ count: count() }).from(users);

      if (search) {
        const searchFilter = sql`(
          ${users.email} ILIKE ${'%' + search + '%'} OR
          ${users.username} ILIKE ${'%' + search + '%'}
        )`;
        query = query.where(searchFilter) as any;
        countQuery = countQuery.where(searchFilter) as any;
      }

      const allUsers = await (query as any)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);

      const [total] = await countQuery;

      const userIds: string[] = allUsers.map((u: any) => u.id);
      let soloCounts: { userId: string; count: number }[] = [];
      if (userIds.length > 0) {
        soloCounts = await db
          .select({
            userId: solos.userId,
            count: count(),
          })
          .from(solos)
          .where(inArray(solos.userId, userIds))
          .groupBy(solos.userId);
      }

      const soloCountMap: Record<string, number> = {};
      soloCounts.forEach((s: any) => {
        soloCountMap[s.userId] = Number(s.count);
      });

      const usersWithStats = allUsers.map((u: any) => ({
        ...u,
        soloCount: soloCountMap[u.id] || 0,
      }));

      return res.json({
        users: usersWithStats,
        total: total.count,
        page,
        pages: Math.ceil(Number(total.count) / limit),
      });
    } catch (error) {
      console.error("Users list error:", error);
      return res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.put("/api/admin/users/:userId", async (req, res) => {
    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    try {
      const { userId } = req.params;
      const { username, bio, isAdmin } = req.body;

      const updates: any = {};
      if (username !== undefined) updates.username = username;
      if (bio !== undefined) updates.bio = bio;
      if (isAdmin !== undefined) updates.isAdmin = isAdmin;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      const [updated] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          email: users.email,
          username: users.username,
          bio: users.bio,
          isAdmin: users.isAdmin,
          createdAt: users.createdAt,
        });

      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.json(updated);
    } catch (error) {
      console.error("Update user error:", error);
      return res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.delete("/api/admin/users/:userId", async (req, res) => {
    const adminId = await requireAdmin(req, res);
    if (!adminId) return;

    try {
      const { userId } = req.params;

      if (userId === adminId) {
        return res.status(400).json({ error: "Cannot delete your own admin account" });
      }

      await db.delete(solos).where(eq(solos.userId, userId));
      await db.delete(users).where(eq(users.id, userId));

      return res.json({ success: true });
    } catch (error) {
      console.error("Delete user error:", error);
      return res.status(500).json({ error: "Failed to delete user" });
    }
  });

  const DOCS_DIR = path.resolve(process.cwd(), "docs");

  const CATEGORY_CONFIG: Record<string, { displayName: string; icon: string; order: number }> = {
    "01-GETTING-STARTED": { displayName: "Getting Started", icon: "rocket", order: 1 },
    "02-ARCHITECTURE": { displayName: "Architecture", icon: "layers", order: 2 },
    "03-FEATURES": { displayName: "Features", icon: "star", order: 3 },
    "04-API": { displayName: "API", icon: "code", order: 4 },
    "05-FRONTEND": { displayName: "Frontend", icon: "monitor", order: 5 },
    "06-BACKEND": { displayName: "Backend", icon: "server", order: 6 },
    "07-SECURITY": { displayName: "Security", icon: "shield", order: 7 },
    "08-DATABASE": { displayName: "Database", icon: "database", order: 8 },
    "09-TESTING": { displayName: "Testing", icon: "check-circle", order: 9 },
    "10-DEPLOYMENT": { displayName: "Deployment", icon: "upload", order: 10 },
    "11-DEVELOPMENT": { displayName: "Development", icon: "terminal", order: 11 },
    "12-OPERATIONS": { displayName: "Operations", icon: "settings", order: 12 },
    "13-INTEGRATIONS": { displayName: "Integrations", icon: "link", order: 13 },
    "14-TROUBLESHOOTING": { displayName: "Troubleshooting", icon: "alert-triangle", order: 14 },
    "15-REFERENCE": { displayName: "Reference", icon: "book", order: 15 },
    "16-CHANGELOG": { displayName: "Changelog", icon: "clock", order: 16 },
    "17-API-REGISTRY": { displayName: "API Registry", icon: "list", order: 17 },
    "18-FUNCTIONAL-DOCS": { displayName: "Functional Docs", icon: "file-text", order: 18 },
  };

  function scanDocsDirectory(): { categories: any[] } {
    if (!fs.existsSync(DOCS_DIR)) {
      return { categories: [] };
    }

    const categoriesMap = new Map<string, any>();

    function scanDir(dirPath: string, categoryId: string) {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isFile() && entry.name.endsWith(".md")) {
          const relativePath = path.relative(DOCS_DIR, fullPath);
          const id = relativePath.replace(/\//g, "__").replace(/\.md$/, "");
          const content = fs.readFileSync(fullPath, "utf-8");
          const titleMatch = content.match(/^#\s+(.+)$/m);
          const title = titleMatch ? titleMatch[1] : entry.name.replace(/\.md$/, "");
          const stat = fs.statSync(fullPath);

          const doc = {
            id,
            filename: entry.name,
            title,
            category: categoryId,
            relativePath,
            sizeBytes: stat.size,
            modifiedAt: stat.mtime.toISOString(),
          };

          if (!categoriesMap.has(categoryId)) {
            const config = CATEGORY_CONFIG[categoryId] || {
              displayName: categoryId.replace(/^\d+-/, "").replace(/-/g, " "),
              icon: "folder",
              order: 100,
            };
            categoriesMap.set(categoryId, {
              id: categoryId,
              displayName: config.displayName,
              icon: config.icon,
              order: config.order,
              docs: [],
            });
          }

          categoriesMap.get(categoryId)!.docs.push(doc);
        }
      }
    }

    const topEntries = fs.readdirSync(DOCS_DIR, { withFileTypes: true });
    for (const entry of topEntries) {
      if (entry.isDirectory()) {
        scanDir(path.join(DOCS_DIR, entry.name), entry.name);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const relativePath = entry.name;
        const id = entry.name.replace(/\.md$/, "");
        const content = fs.readFileSync(path.join(DOCS_DIR, entry.name), "utf-8");
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1] : entry.name.replace(/\.md$/, "");
        const stat = fs.statSync(path.join(DOCS_DIR, entry.name));

        if (!categoriesMap.has("_root")) {
          categoriesMap.set("_root", {
            id: "_root",
            displayName: "General",
            icon: "file",
            order: 0,
            docs: [],
          });
        }

        categoriesMap.get("_root")!.docs.push({
          id,
          filename: entry.name,
          title,
          category: "_root",
          relativePath,
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        });
      }
    }

    const categories = Array.from(categoriesMap.values())
      .sort((a, b) => a.order - b.order);

    for (const cat of categories) {
      cat.docs.sort((a: any, b: any) => a.title.localeCompare(b.title));
    }

    return { categories };
  }

  app.get("/api/admin/docs", async (req, res) => {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    try {
      const result = scanDocsDirectory();
      return res.json(result);
    } catch (error) {
      console.error("Docs list error:", error);
      return res.status(500).json({ error: "Failed to fetch docs" });
    }
  });

  app.get("/api/admin/docs/coverage", async (req, res) => {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    try {
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

      for (const req of requiredFunctionalDocs) {
        const docFile = path.join(functionalDocsDir, `${req.id}.md`);
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
          id: req.id,
          name: req.name,
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
    } catch (error) {
      console.error("Coverage error:", error);
      return res.status(500).json({ error: "Failed to compute coverage" });
    }
  });

  app.get("/api/admin/docs/:docPath", async (req, res) => {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    try {
      const docPath = req.params.docPath;
      if (docPath.includes("..")) {
        return res.status(400).json({ error: "Invalid path" });
      }

      const relativePath = docPath.replace(/__/g, "/") + ".md";
      const fullPath = path.resolve(DOCS_DIR, relativePath);

      if (!fullPath.startsWith(DOCS_DIR)) {
        return res.status(400).json({ error: "Invalid path" });
      }

      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: "Document not found" });
      }

      const content = fs.readFileSync(fullPath, "utf-8");
      const stat = fs.statSync(fullPath);
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : path.basename(fullPath, ".md");

      return res.json({
        id: docPath,
        filename: path.basename(fullPath),
        title,
        content,
        relativePath,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    } catch (error) {
      console.error("Doc read error:", error);
      return res.status(500).json({ error: "Failed to read doc" });
    }
  });

  app.post("/api/admin/docs/sync", async (req, res) => {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    try {
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
    } catch (error) {
      console.error("Sync error:", error);
      return res.status(500).json({ error: "Failed to sync docs" });
    }
  });
}
