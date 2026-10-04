import type { ErrorCode, ServiceError } from "@/contracts";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  INTERNAL: 500,
};

/** JSON error body for AI routes. Only the safe code and message are returned. */
export function errorResponse(error: ServiceError): Response {
  return Response.json(
    { error: { code: error.code, message: error.message } },
    { status: STATUS[error.code] },
  );
}

export const unauthenticated = () =>
  errorResponse({ code: "UNAUTHENTICATED", message: "Sign in to use the AI assistant." });
