import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponseV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { getDaaSystemConfigV2 } from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

function normalizeText(value: unknown, fallback = ""): string {
  const text = String(value || "").trim();
  return text || fallback;
}

type LlmHealthProbeV1 = {
  reachable: boolean;
  healthCode: number | null;
  healthMessage: string;
  checkedAt: string;
};

async function probeLlmEndpointV1(input: { endpoint: string; apiKey: string; model: string; timeoutMs?: number }): Promise<LlmHealthProbeV1> {
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
    const response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(input.apiKey ? { authorization: `Bearer ${input.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: normalizeText(input.model, "gpt-5-codex"),
        input: "health-check",
        max_output_tokens: 1,
      }),
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
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const system = await getDaaSystemConfigV2();
    const llm = system.config.dataSources.llmAnalysis;
    const provider = normalizeText(llm.provider || "codex").toLowerCase();

    const endpoint = provider === "packycode"
      ? normalizeText(process.env.PACKYCODE_ENDPOINT)
      : normalizeText(process.env.DAA_LLM_ENDPOINT, "https://api.openai.com/v1/responses");
    const apiKey = provider === "packycode"
      ? normalizeText(process.env.PACKYCODE_API_KEY)
      : normalizeText(process.env.OPENAI_API_KEY);
    const envModel = normalizeText(process.env.DAA_LLM_MODEL || process.env.OPENAI_MODEL);
    const model = envModel || normalizeText(llm.model, "gpt-5-codex");
    const health = await probeLlmEndpointV1({ endpoint, apiKey, model });

    return okV1({
      provider,
      endpointConfigured: Boolean(endpoint),
      apiKeyConfigured: Boolean(apiKey),
      modelConfigured: Boolean(envModel || llm.model),
      endpointHint: endpoint ? `${endpoint.slice(0, 64)}${endpoint.length > 64 ? "..." : ""}` : "",
      model,
      reachable: health.reachable,
      healthCode: health.healthCode,
      healthMessage: health.healthMessage,
      checkedAt: health.checkedAt,
    });
  });
}
