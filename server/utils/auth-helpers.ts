import type { Request, Response } from "express";
import cookieSignature from "cookie-signature";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { AppError } from "../lib/errors";

export async function requireAuth(req: Request, res: Response): Promise<string | null> {
  let userId = req.session?.userId;

  if (!userId) {
    const sessionToken = req.headers['x-session-token'] as string | undefined;
    if (sessionToken) {
      const secret = process.env.SESSION_SECRET || "solo-secret-fallback";
      let rawSid = sessionToken;
      if (rawSid.startsWith('connect.sid=')) {
        rawSid = rawSid.replace('connect.sid=', '');
      }
      if (rawSid.startsWith('s%3A') || rawSid.startsWith('s:')) {
        rawSid = decodeURIComponent(rawSid).replace(/^s:/, '');
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

  if (!userId) {
    throw AppError.unauthorized();
  }

  const [user] = await db.select({ isDisabled: users.isDisabled }).from(users).where(eq(users.id, userId)).limit(1);
  if (user?.isDisabled) {
    throw AppError.forbidden("Account is disabled. Contact support for assistance.");
  }

  return userId;
}

export function getSessionCookie(req: Request): string {
  const secret = process.env.SESSION_SECRET || "solo-secret-fallback";
  const signed = cookieSignature.sign(req.sessionID, secret);
  return `connect.sid=s%3A${encodeURIComponent(signed).replace(/%3A/g, ':')}`;
}

export async function requireAdmin(req: Request, res: Response): Promise<string | null> {
  const userId = req.session?.userId;
  if (!userId) {
    throw AppError.unauthorized();
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.isAdmin) {
    throw AppError.forbidden("Admin access required");
  }

  return userId;
}
