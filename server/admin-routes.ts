import type { Express, Request, Response } from "express";
import { db } from "./db";
import { users, solos, appDocs } from "@shared/schema";
import { eq, desc, sql, count, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

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

      const userIds = allUsers.map((u: any) => u.id);
      const soloCounts = await db
        .select({
          userId: solos.userId,
          count: count(),
        })
        .from(solos)
        .where(sql`${solos.userId} = ANY(${userIds})`)
        .groupBy(solos.userId);

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

  app.get("/api/admin/docs", async (req, res) => {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    try {
      const docs = await db
        .select()
        .from(appDocs)
        .orderBy(appDocs.sortOrder, appDocs.createdAt);
      return res.json(docs);
    } catch (error) {
      console.error("Docs list error:", error);
      return res.status(500).json({ error: "Failed to fetch docs" });
    }
  });

  app.post("/api/admin/docs", async (req, res) => {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    try {
      const { title, content, category, sortOrder } = req.body;
      if (!title) {
        return res.status(400).json({ error: "Title is required" });
      }

      const [doc] = await db
        .insert(appDocs)
        .values({
          title,
          content: content || "",
          category: category || "General",
          sortOrder: sortOrder || 0,
        })
        .returning();

      return res.json(doc);
    } catch (error) {
      console.error("Create doc error:", error);
      return res.status(500).json({ error: "Failed to create doc" });
    }
  });

  app.put("/api/admin/docs/:docId", async (req, res) => {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    try {
      const docId = parseInt(req.params.docId);
      const { title, content, category, sortOrder } = req.body;

      const updates: any = { updatedAt: new Date() };
      if (title !== undefined) updates.title = title;
      if (content !== undefined) updates.content = content;
      if (category !== undefined) updates.category = category;
      if (sortOrder !== undefined) updates.sortOrder = sortOrder;

      const [updated] = await db
        .update(appDocs)
        .set(updates)
        .where(eq(appDocs.id, docId))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Doc not found" });
      }

      return res.json(updated);
    } catch (error) {
      console.error("Update doc error:", error);
      return res.status(500).json({ error: "Failed to update doc" });
    }
  });

  app.delete("/api/admin/docs/:docId", async (req, res) => {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    try {
      const docId = parseInt(req.params.docId);
      await db.delete(appDocs).where(eq(appDocs.id, docId));
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete doc error:", error);
      return res.status(500).json({ error: "Failed to delete doc" });
    }
  });
}
