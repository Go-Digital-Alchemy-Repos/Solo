export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(opts: {
    status: number;
    code: string;
    message: string;
    details?: Record<string, unknown>;
  }) {
    super(opts.message);
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(message: string, details?: Record<string, unknown>) {
    return new AppError({ status: 400, code: "BAD_REQUEST", message, details });
  }

  static unauthorized(message = "Not authenticated") {
    return new AppError({ status: 401, code: "UNAUTHORIZED", message });
  }

  static forbidden(message = "Access denied") {
    return new AppError({ status: 403, code: "FORBIDDEN", message });
  }

  static notFound(message = "Resource not found") {
    return new AppError({ status: 404, code: "NOT_FOUND", message });
  }

  static conflict(message: string) {
    return new AppError({ status: 409, code: "CONFLICT", message });
  }

  static internal(message = "Internal server error") {
    return new AppError({ status: 500, code: "INTERNAL_ERROR", message });
  }

  static validationFailed(fieldErrors: Record<string, string[]>) {
    return new AppError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: { fields: fieldErrors },
    });
  }

  toJSON() {
    const obj: Record<string, unknown> = {
      code: this.code,
      message: this.message,
    };
    if (this.details) obj.details = this.details;
    return { ok: false, error: obj };
  }
}
