import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { resolveSecret } from "@/src/daa/config/secretsManager";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";

export const runtime = "nodejs";

function normalizeText(value: unknown, fallback = ""): string {
  const text = String(value || "").trim();
  return text || fallback;
}

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

    const system = await getDaaSystemConfig();
    const llm = system.config.dataSources.llmAnalysis;
    const provider = normalizeText(llm.provider || "deepseek").toLowerCase();

    // Use secretsManager for env > DB resolution
    const apiKey = await resolveSecret("llm_api_key");
    const endpoint = normalizeText(await resolveSecret("llm_endpoint"), "https://api.deepseek.com/v1/chat/completions");
    const secretModel = await resolveSecret("llm_model");
    const model = normalizeText(secretModel, normalizeText(llm.model, "deepseek-chat"));
    const health = await probeLlmEndpoint({ endpoint, apiKey, model });

    return ok({
      provider,
      endpointConfigured: Boolean(endpoint),
      apiKeyConfigured: Boolean(apiKey),
      modelConfigured: Boolean(secretModel || llm.model),
      endpointHint: endpoint ? `${endpoint.slice(0, 64)}${endpoint.length > 64 ? "..." : ""}` : "",
      model,
      reachable: health.reachable,
      healthCode: health.healthCode,
      healthMessage: health.healthMessage,
      checkedAt: health.checkedAt,
    });
  });
}
