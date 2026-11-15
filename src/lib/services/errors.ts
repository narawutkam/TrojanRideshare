import type { ErrorCode } from "@/types";

/** Typed service error. The route layer maps `code` to the HTTP status below (README §5 "Failures"). */
export class AppError extends Error {
  constructor(public readonly code: ErrorCode, message: string) {
    super(message);
    this.name = "AppError";
  }
}

export const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  TRIP_NOT_FOUND: 404,
  TRIP_FULL: 409,
  TRIP_CLOSED: 409,
  ALREADY_REPORTED: 409,
  ACTIVE_TRIP_EXISTS: 409,
  LEAVE_WINDOW_CLOSED: 409,
  AGREEMENT_REQUIRED: 422,
  RATE_LIMITED: 429,
  PROVIDER_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};
