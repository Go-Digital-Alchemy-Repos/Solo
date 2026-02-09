import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/errors";

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof AppError) {
    return res.status(err.status).json(err.toJSON());
  }

  const error = err as {
    status?: number;
    statusCode?: number;
    message?: string;
  };

  const status = error.status || error.statusCode || 500;
  const message = error.message || "Internal Server Error";

  console.error("Internal Server Error:", err);

  return res.status(status).json({
    ok: false,
    error: {
      code: status === 404 ? "NOT_FOUND" : "INTERNAL_ERROR",
      message,
    },
  });
}
