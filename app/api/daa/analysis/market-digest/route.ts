import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { runLlmAnalysisV1 } from "@/src/daa/llm/llmAnalysisV1";

export const runtime = "nodejs";

type DigestBody = {
  baseCurrency?: string;
  shouldRebalance?: boolean;
  opportunities?: Array<{
    symbol?: string;
    finalScorePct?: number;
    confidencePct?: number;
    riskScorePct?: number;
    action?: string;
    reasons?: string[];
  }>;
  warnings?: string[];
};

function normalizeText(value: unknown, fallback = ""): string {
  const text = String(value || "").trim();
  return text || fallback;
}

function toFinite(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<DigestBody>(req);
    const opportunities = Array.isArray(body?.opportunities)
      ? body.opportunities.map((item) => ({
        symbol: normalizeText(item?.symbol).toUpperCase(),
        finalScorePct: toFinite(item?.finalScorePct, 50),
        confidencePct: toFinite(item?.confidencePct, 40),
        riskScorePct: toFinite(item?.riskScorePct, 50),
        action: normalizeText(item?.action, "watch"),
        reasons: Array.isArray(item?.reasons) ? item.reasons.map((x) => normalizeText(x)).filter(Boolean) : [],
      })).filter((item) => item.symbol)
      : [];

    if (!opportunities.length) {
      return failV1("VALIDATION_FAILED", "opportunities must be a non-empty array", { status: 400 });
    }

    const analysis = await runLlmAnalysisV1({
      baseCurrency: normalizeText(body?.baseCurrency, "USD").toUpperCase(),
      shouldRebalance: Boolean(body?.shouldRebalance),
      opportunities,
      warnings: Array.isArray(body?.warnings) ? body.warnings.map((x) => normalizeText(x)).filter(Boolean) : [],
    });

    return okV1({ analysis });
  });
}

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    return okV1({
      message: "POST opportunities payload to run LLM market digest analysis.",
      now: new Date().toISOString(),
    });
  });
}
