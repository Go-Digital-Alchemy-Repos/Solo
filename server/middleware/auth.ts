import type { Request, Response, NextFunction } from "express";
import { auth } from "../auth";
import { fromNodeHeaders } from "better-auth/node";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import cookieSignature from "cookie-signature";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  source: "legacy" | "better-auth";
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
    }
  }
}

async function resolveLegacySession(req: Request): Promise<AuthenticatedUser | null> {
  let userId = req.session?.userId;

  if (!userId) {
    const sessionToken = req.headers["x-session-token"] as string | undefined;
    if (sessionToken) {
      const secret = process.env.SESSION_SECRET || "solo-secret-fallback";
      let rawSid = sessionToken;
      if (rawSid.startsWith("connect.sid=")) {
        rawSid = rawSid.replace("connect.sid=", "");
      }
      if (rawSid.startsWith("s%3A") || rawSid.startsWith("s:")) {
        rawSid = decodeURIComponent(rawSid).replace(/^s:/, "");
      }
      const unsigned = cookieSignature.unsign(rawSid, secret);
      if (unsigned !== false) {
        try {
          const sess = await new Promise<any>((resolve, reject) => {
            req.sessionStore.get(unsigned as string, (err: any, session: any) => {
              if (err) reject(err);
              else resolve(session);
            });
          });
          if (sess?.userId) {
            userId = sess.userId;
          }
        } catch {}
      }
    }
  }

  if (!userId) return null;

  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      role: user.isAdmin ? "admin" : (user.role || "user"),
      source: "legacy",
    };
  } catch {
    return null;
  }
}

async function resolveBetterAuthSession(req: Request): Promise<AuthenticatedUser | null> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session?.user) return null;
    return {
      id: session.user.id,
      email: session.user.email,
      role: (session.user as any).role || "user",
      source: "better-auth",
    };
  } catch {
    return null;
  }
}

export function sessionValidation(options?: { required?: boolean }) {
  const required = options?.required ?? false;

  return async (req: Request, res: Response, next: NextFunction) => {
    const legacyUser = await resolveLegacySession(req);
    if (legacyUser) {
      req.authUser = legacyUser;
      return next();
    }

    const baUser = await resolveBetterAuthSession(req);
    if (baUser) {
      req.authUser = baUser;
      return next();
    }

    if (required) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    next();
  };
}

export function requireAuth() {
  return sessionValidation({ required: true });
}
