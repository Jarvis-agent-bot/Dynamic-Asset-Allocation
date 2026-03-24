export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "DB_ERROR"
  | "BAD_RESPONSE_FORMAT"
  | "INTERNAL_ERROR"
  | "VERSION_CONFLICT"
  | "ROUTE_DENIED"
  | "CRON_AUTH_FAILED"
  | "BROKER_READ_ONLY"
  | "BROKER_SESSION_NOT_READY"
  | "UNKNOWN";

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiError = {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  if (!value || typeof value !== "object") return false;
  const raw = value as any;
  if (raw.ok === true) return "data" in raw;
  if (raw.ok === false) return !!raw.error && typeof raw.error === "object";
  return false;
}
