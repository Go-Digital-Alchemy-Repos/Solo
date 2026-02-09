import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import { eventLogger } from "../lib/eventLogger";

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    return next(err);
  }

  const requestId = req.requestId;
  const userId = req.session?.userId || req.authUser?.id;

  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error(err.message, { requestId, error: err.code });
      eventLogger.error("error-handler", "server_error", err.message, {
        code: err.code,
        status: err.status,
        path: req.path,
        method: req.method,
        details: err.details,
      }, { requestId, userId });
    }
    return res.status(err.status).json({ ...err.toJSON(), requestId });
  }

  const error = err as {
    status?: number;
    statusCode?: number;
    message?: string;
  };

  const status = error.status || error.statusCode || 500;
  const message = error.message || "Internal Server Error";

  logger.error(`Unhandled: ${message}`, {
    requestId,
    error: err instanceof Error ? err.stack?.slice(0, 500) : String(err),
  });

  eventLogger.error("error-handler", "unhandled_error", message, {
    status,
    path: req.path,
    method: req.method,
    stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
  }, { requestId, userId });

  return res.status(status).json({
    ok: false,
    error: {
      code: status === 404 ? "NOT_FOUND" : "INTERNAL_ERROR",
      message,
    },
    requestId,
  });
}
