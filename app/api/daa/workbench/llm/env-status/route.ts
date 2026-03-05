import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponseV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { getDaaSystemConfigV2 } from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

function normalizeText(value: unknown, fallback = ""): string {
  const text = String(value || "").trim();
  return text || fallback;
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

    return okV1({
      provider,
      endpointConfigured: Boolean(endpoint),
      apiKeyConfigured: Boolean(apiKey),
      modelConfigured: Boolean(envModel || llm.model),
      endpointHint: endpoint ? `${endpoint.slice(0, 64)}${endpoint.length > 64 ? "..." : ""}` : "",
      model: envModel || llm.model,
    });
  });
}
