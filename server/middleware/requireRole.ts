import type { Request, Response, NextFunction } from "express";

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const userRole = req.authUser.role;
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    next();
  };
}

export function requireAdmin() {
  return requireRole("admin");
}

export function requireUser() {
  return requireRole("user", "admin");
}
