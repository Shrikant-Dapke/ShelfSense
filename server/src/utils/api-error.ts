/**
 * Application error type. Thrown by services, rendered by the centralized
 * error middleware. Never leak internals to clients — `expose` controls what
 * the error handler may send.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  /** When false, the error handler reports the message as a generic 500. */
  readonly expose: boolean;

  constructor(
    status: number,
    code: string,
    message: string,
    options?: { details?: unknown; expose?: boolean; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = options?.details;
    this.expose = options?.expose ?? true;
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, "BAD_REQUEST", message, { details });
  }

  static unauthorized(message = "Authentication required"): ApiError {
    return new ApiError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "You do not have permission to perform this action"): ApiError {
    return new ApiError(403, "FORBIDDEN", message);
  }

  static notFound(message = "Resource not found"): ApiError {
    return new ApiError(404, "NOT_FOUND", message);
  }

  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, "CONFLICT", message, { details });
  }

  static validation(message: string, details?: unknown): ApiError {
    return new ApiError(422, "VALIDATION_ERROR", message, { details });
  }

  static internal(message = "Internal server error"): ApiError {
    return new ApiError(500, "INTERNAL_ERROR", message, { expose: false });
  }
}
