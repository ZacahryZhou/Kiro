export type Role = "TEACHER" | "STUDENT";
export type Actor = { userId: string; role: Role };
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "INTERNAL";
export type ServiceError = { code: ErrorCode; message: string; details?: unknown };
export type Result<T> = { ok: true; data: T } | { ok: false; error: ServiceError };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err(code: ErrorCode, message: string, details?: unknown): Result<never> {
  return { ok: false, error: details === undefined ? { code, message } : { code, message, details } };
}
