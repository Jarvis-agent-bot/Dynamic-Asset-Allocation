import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { resolveLlmConfig, resolveLlmRequestEndpoint } from "@/src/daa/llm/llmClient";
import { normalizeText } from "@/src/daa/utils/normalize";

export const runtime = "nodejs";

type LlmHealthProbe = {
  reachable: boolean;
  healthCode: number | null;
  healthMessage: string;
  checkedAt: string;
};

async function probeLlmEndpoint(input: { endpoint: string; apiKey: string; model: string; timeoutMs?: number }): Promise<LlmHealthProbe> {
  const checkedAt = new Date().toISOString();
  const endpoint = normalizeText(input.endpoint);
  if (!endpoint) {
    return {
      reachable: false,
      healthCode: null,
      healthMessage: "endpoint 未配置",
      checkedAt,
    };
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(500, Math.min(5000, Math.trunc(input.timeoutMs ?? 1500)));
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const isChatCompletions = endpoint.includes("/chat/completions");
    const body = isChatCompletions
      ? JSON.stringify({
          model: normalizeText(input.model, "deepseek-chat"),
          messages: [{ role: "user", content: "health-check" }],
          max_tokens: 1,
        })
      : JSON.stringify({
          model: normalizeText(input.model, "deepseek-chat"),
          input: "health-check",
          max_output_tokens: 1,
        });

    const response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(input.apiKey ? { authorization: `Bearer ${input.apiKey}` } : {}),
      },
      body,
    });

    return {
      reachable: response.status < 500,
      healthCode: response.status,
      healthMessage: `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`.trim(),
      checkedAt,
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return {
      reachable: false,
      healthCode: isAbort ? 408 : null,
      healthMessage: isAbort ? "请求超时" : (error instanceof Error ? error.message : String(error)),
      checkedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const config = await resolveLlmConfig("analysis");
    const requestEndpoint = resolveLlmRequestEndpoint(config.provider, config.endpoint);
    const health = await probeLlmEndpoint({
      endpoint: requestEndpoint,
      apiKey: config.apiKey,
      model: config.model,
    });

    return ok({
      provider: config.provider,
      endpointConfigured: Boolean(config.endpoint),
      apiKeyConfigured: Boolean(config.apiKey),
      modelConfigured: Boolean(config.model),
      endpointHint: requestEndpoint ? `${requestEndpoint.slice(0, 64)}${requestEndpoint.length > 64 ? "..." : ""}` : "",
      model: config.model,
      reachable: health.reachable,
      healthCode: health.healthCode,
      healthMessage: health.healthMessage,
      checkedAt: health.checkedAt,
    });
  });
}
