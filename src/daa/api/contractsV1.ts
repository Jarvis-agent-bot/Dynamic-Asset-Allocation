export type ApiErrorCodeV1 =
  | "UNAUTHORIZED"
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "DB_ERROR"
  | "BAD_RESPONSE_FORMAT"
  | "INTERNAL_ERROR"
  | "ROUTE_DENIED"
  | "CRON_AUTH_FAILED"
  | "UNKNOWN";

export type ApiSuccessV1<T> = {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiErrorV1 = {
  ok: false;
  error: {
    code: ApiErrorCodeV1;
    message: string;
    details?: unknown;
  };
};

export type ApiResponseV1<T> = ApiSuccessV1<T> | ApiErrorV1;

export function isApiResponseV1(value: unknown): value is ApiResponseV1<unknown> {
  if (!value || typeof value !== "object") return false;
  const raw = value as any;
  if (raw.ok === true) return "data" in raw;
  if (raw.ok === false) return !!raw.error && typeof raw.error === "object";
  return false;
}
