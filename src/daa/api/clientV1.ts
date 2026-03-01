import { isApiResponseV1, type ApiErrorCodeV1, type ApiResponseV1 } from "@/src/daa/api/contractsV1";

type RequestApiOptionsV1 = {
  fallbackErrorCode?: ApiErrorCodeV1;
  fallbackErrorMessage?: string;
};

export class ApiClientErrorV1 extends Error {
  readonly code: ApiErrorCodeV1;
  readonly status: number;
  readonly details?: unknown;

  constructor(input: { code: ApiErrorCodeV1; message: string; status?: number; details?: unknown }) {
    super(input.message);
    this.name = "ApiClientErrorV1";
    this.code = input.code;
    this.status = input.status ?? 500;
    this.details = input.details;
  }
}

function toErrorResponseV1(
  code: ApiErrorCodeV1,
  message: string,
  details?: unknown,
): ApiResponseV1<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
}

function safeParseJsonV1(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeUnknownErrorMessageV1(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error || "unknown_error");
}

export async function requestApiV1<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts: RequestApiOptionsV1 = {},
): Promise<{ response: Response; payload: ApiResponseV1<T> }> {
  const fallbackCode = opts.fallbackErrorCode ?? "UNKNOWN";
  const fallbackMessage = opts.fallbackErrorMessage ?? "request_failed";

  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    return {
      response: new Response(null, { status: 520 }),
      payload: toErrorResponseV1(fallbackCode, normalizeUnknownErrorMessageV1(error)),
    };
  }

  const rawText = await response.text();
  if (!rawText.trim()) {
    return {
      response,
      payload: toErrorResponseV1(
        "BAD_RESPONSE_FORMAT",
        `empty_response_body (HTTP ${response.status})`,
        { status: response.status },
      ),
    };
  }

  const parsed = safeParseJsonV1(rawText);
  if (!isApiResponseV1(parsed)) {
    return {
      response,
      payload: toErrorResponseV1(
        "BAD_RESPONSE_FORMAT",
        `invalid_api_response (HTTP ${response.status})`,
        {
          status: response.status,
          bodyPreview: rawText.slice(0, 240),
        },
      ),
    };
  }

  return { response, payload: parsed as ApiResponseV1<T> };
}

export async function requestDataV1<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts: RequestApiOptionsV1 = {},
): Promise<T> {
  const { response, payload } = await requestApiV1<T>(input, init, opts);

  if (payload.ok) {
    return payload.data;
  }

  throw new ApiClientErrorV1({
    code: payload.error.code,
    message: payload.error.message || opts.fallbackErrorMessage || `HTTP ${response.status}`,
    status: response.status || 500,
    details: payload.error.details,
  });
}

export function getApiErrorMessageV1(error: unknown): string {
  if (error instanceof ApiClientErrorV1) {
    return `${error.message}${error.code ? ` (${error.code})` : ""}`;
  }
  return normalizeUnknownErrorMessageV1(error);
}
