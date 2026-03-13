import { isApiResponse, type ApiErrorCode, type ApiResponse } from "@/src/daa/api/contracts";

type RequestApiOptions = {
  fallbackErrorCode?: ApiErrorCode;
  fallbackErrorMessage?: string;
};

export class ApiClientError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(input: { code: ApiErrorCode; message: string; status?: number; details?: unknown }) {
    super(input.message);
    this.name = "ApiClientError";
    this.code = input.code;
    this.status = input.status ?? 500;
    this.details = input.details;
  }
}

function toErrorResponse(
  code: ApiErrorCode,
  message: string,
  details?: unknown,
): ApiResponse<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeUnknownErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error || "unknown_error");
}

function normalizeDisplayErrorMessage(message: string): string {
  if (/Unexpected end of JSON input/i.test(message)) {
    return "服务返回了空响应，请重试；若持续出现请刷新页面并检查后端日志。";
  }
  return message;
}

export async function requestApi<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts: RequestApiOptions = {},
): Promise<{ response: Response; payload: ApiResponse<T> }> {
  const fallbackCode = opts.fallbackErrorCode ?? "UNKNOWN";
  const fallbackMessage = opts.fallbackErrorMessage ?? "request_failed";

  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    return {
      response: new Response(null, { status: 520 }),
      payload: toErrorResponse(fallbackCode, normalizeUnknownErrorMessage(error)),
    };
  }

  const rawText = await response.text();
  if (!rawText.trim()) {
    return {
      response,
      payload: toErrorResponse(
        "BAD_RESPONSE_FORMAT",
        `empty_response_body (HTTP ${response.status})`,
        { status: response.status },
      ),
    };
  }

  const parsed = safeParseJson(rawText);
  if (!isApiResponse(parsed)) {
    return {
      response,
      payload: toErrorResponse(
        "BAD_RESPONSE_FORMAT",
        `invalid_api_response (HTTP ${response.status})`,
        {
          status: response.status,
          bodyPreview: rawText.slice(0, 240),
        },
      ),
    };
  }

  return { response, payload: parsed as ApiResponse<T> };
}

export async function requestData<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts: RequestApiOptions = {},
): Promise<T> {
  const { response, payload } = await requestApi<T>(input, init, opts);

  if (payload.ok) {
    return payload.data;
  }

  throw new ApiClientError({
    code: payload.error.code,
    message: payload.error.message || opts.fallbackErrorMessage || `HTTP ${response.status}`,
    status: response.status || 500,
    details: payload.error.details,
  });
}

export function getApiErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${normalizeDisplayErrorMessage(error.message)}${error.code ? ` (${error.code})` : ""}`;
  }
  return normalizeDisplayErrorMessage(normalizeUnknownErrorMessage(error));
}
