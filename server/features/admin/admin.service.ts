import { db } from "../../db";
import { users, solos } from "@shared/schema";
import { eq, desc, sql, count, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as fs from "fs";
import * as path from "path";
import { DOCS_DIR } from "../../utils/paths";

export async function findUserByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user || null;
}

export async function findUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user || null;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function getStats() {
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

  return {
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
  };
}

export async function listUsers(page: number, limit: number, search: string) {
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

  return {
    users: usersWithStats,
    total: total.count,
    page,
    pages: Math.ceil(Number(total.count) / limit),
  };
}

export async function updateUser(userId: string, updates: Record<string, any>) {
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
  return updated || null;
}

export async function deleteUser(userId: string) {
  await db.delete(solos).where(eq(solos.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

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

export function scanDocsDirectory(): { categories: any[] } {
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
        relativePath: entry.name,
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

export function readDoc(docPath: string) {
  if (docPath.includes("..")) return null;

  const relativePath = docPath.replace(/__/g, "/") + ".md";
  const fullPath = path.resolve(DOCS_DIR, relativePath);

  if (!fullPath.startsWith(DOCS_DIR)) return null;
  if (!fs.existsSync(fullPath)) return null;

  const content = fs.readFileSync(fullPath, "utf-8");
  const stat = fs.statSync(fullPath);
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : path.basename(fullPath, ".md");

  return {
    id: docPath,
    filename: path.basename(fullPath),
    title,
    content,
    relativePath,
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  };
}
