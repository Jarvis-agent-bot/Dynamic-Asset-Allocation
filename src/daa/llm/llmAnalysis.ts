import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import { DEFAULT_ANALYSIS_FOCUS_ } from "@/src/daa/llm/analysisFocusDefaults";
import type { DaaMarketContext, DaaMarketRegime } from "@/src/daa/modules/marketContext/marketContextTypes";

export type DaaLlmAnalysisStatus = "skipped" | "ok" | "error";
export type DaaLlmAnalysisContext = "decision" | "insight" | "digest";

export type DaaLlmAnalysis = {
  status: DaaLlmAnalysisStatus;
  provider: string;
  model: string;
  generatedAt: string;
  summary: string;
  opportunityNotes: string[];
  riskNotes: string[];
  latencyMs: number;
  reasonCode?: string;
  reasonMessage?: string;
  failedAt?: string;
  reason?: string;
  raw?: unknown;
  marketRegime?: DaaMarketRegime | null;
  marketFacts?: string[];
};

export type DaaLlmAnalysisInput = {
  analysisContext: DaaLlmAnalysisContext;
  baseCurrency: string;
  shouldRebalance: boolean;
  analysisFocus: string;
  opportunities: Array<{
    symbol: string;
    finalScorePct: number;
    confidencePct: number;
    riskScorePct: number;
    action: string;
    reasons: string[];
  }>;
  warnings: string[];
  marketContext?: DaaMarketContext | null;
};

export { DEFAULT_ANALYSIS_FOCUS_ };

type LlmRuntimeConfig = {
  enabled: boolean;
  enabledInDecision: boolean;
  provider: string;
  model: string;
  endpoint: string;
  apiKey: string;
  timeoutMs: number;
};

class LlmRequestError extends Error {
  status: number;
  reasonCode: string;

  constructor(status: number, message: string) {
    super(message);
    this.name = "LlmRequestError";
    this.status = status;
    this.reasonCode = `http_${status}`;
  }
}

function normalizeText(value: unknown, fallback = ""): string {
  const text = String(value || "").trim();
  return text || fallback;
}

function toFinite(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function resolveLlmRuntimeConfig(): Promise<LlmRuntimeConfig> {
  const system = await getDaaSystemConfig();
  const config = system.config.dataSources.llmAnalysis;
  const provider = normalizeText(config.provider, "codex").toLowerCase();
  const envModel = normalizeText(process.env.DAA_LLM_MODEL || process.env.OPENAI_MODEL);
  const model = normalizeText(envModel, normalizeText(config.model, provider === "packycode" ? "packycode-default" : "gpt-5-codex"));
  const timeoutMs = Math.max(2000, Math.min(20000, Math.trunc(toFinite(config.timeoutMs, 8000))));

  const endpoint = provider === "packycode"
    ? normalizeText(process.env.PACKYCODE_ENDPOINT)
    : normalizeText(process.env.DAA_LLM_ENDPOINT, "https://api.openai.com/v1/responses");

  const apiKey = provider === "packycode"
    ? normalizeText(process.env.PACKYCODE_API_KEY)
    : normalizeText(process.env.OPENAI_API_KEY);

  const enabled = Boolean(config.enabled);
  const enabledInDecision = config.enabledInDecision !== false;

  return {
    enabled,
    enabledInDecision,
    provider,
    model,
    endpoint,
    apiKey,
    timeoutMs,
  };
}

function formatMarketContextForPrompt(marketContext: DaaMarketContext | null | undefined): string {
  if (!marketContext) return "市场状态层未启用或暂无可用快照";
  const reasons = marketContext.reasons.slice(0, 3).join("; ") || "无";
  const indicators = marketContext.indicators.slice(0, 4).map((item) => (
    `${item.label}:值=${item.rawValue == null ? "N/A" : item.rawValue}${item.unit || ""},分位=${item.percentile252 == null ? "N/A" : item.percentile252.toFixed(1)}%,说明=${item.reason}`
  )).join(" | ");
  return `regime=${marketContext.regime}, riskOffScore=${marketContext.riskOffScorePct.toFixed(1)}, buyScale=${marketContext.buyScale.toFixed(2)}, highRiskBuyScale=${marketContext.highRiskBuyScale.toFixed(2)}, reasons=${reasons}, indicators=${indicators}`;
}

function buildMarketFactsFromContext(marketContext: DaaMarketContext | null | undefined): string[] {
  if (!marketContext) return [];
  const indicatorFacts = marketContext.indicators.slice(0, 3).map((item) => `${item.label}: ${item.reason}`);
  if (indicatorFacts.length > 0) return indicatorFacts;
  return marketContext.reasons.slice(0, 3);
}

function buildPrompt(input: DaaLlmAnalysisInput): string {
  const top = input.opportunities.slice(0, 8).map((item, index) => (
    `${index + 1}. ${item.symbol} | score=${item.finalScorePct.toFixed(1)} | confidence=${item.confidencePct.toFixed(1)} | risk=${item.riskScorePct.toFixed(1)} | action=${item.action} | reasons=${item.reasons.slice(0, 3).join(";")}`
  )).join("\n");

  const warningText = input.warnings.slice(0, 8).join("; ") || "无";
  const marketText = formatMarketContextForPrompt(input.marketContext);

  return [
    "你是DAA投资风控分析助手，请仅输出结构化结论，不要给下单指令。",
    `基准币种: ${input.baseCurrency}`,
    `再平衡触发: ${input.shouldRebalance ? "是" : "否"}`,
    `分析关注点: ${input.analysisFocus}`,
    `机会列表:
${top || "无"}`,
    `系统告警: ${warningText}`,
    `当前市场环境: ${marketText}`,
    "请返回三段内容：",
    "1) summary：一句总体判断",
    "2) opportunity_notes：3-5条机会说明",
    "3) risk_notes：3-5条风险提示",
  ].join("\n");
}

function extractTextFromOpenAiLike(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload?.output) ? payload.output : [];
  const parts: string[] = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const block of content) {
      const text = String(block?.text || "").trim();
      if (text) parts.push(text);
    }
  }

  return parts.join("\n").trim();
}

function splitAnalysisText(text: string): { summary: string; opportunityNotes: string[]; riskNotes: string[] } {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return {
      summary: "LLM 未返回可解析内容。",
      opportunityNotes: [],
      riskNotes: [],
    };
  }

  const lines = normalized
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  const summary = lines[0] || "LLM 输出为空";
  const opportunityNotes = lines.filter((line) => /opportunity|机会|看多|增配|open|add/i.test(line)).slice(0, 5);
  const riskNotes = lines.filter((line) => /risk|风险|回撤|减仓|avoid|reduce/i.test(line)).slice(0, 5);

  return {
    summary,
    opportunityNotes,
    riskNotes,
  };
}

function resolveFailure(error: unknown): { reasonCode: string; reasonMessage: string } {
  if (error instanceof LlmRequestError) {
    return {
      reasonCode: error.reasonCode,
      reasonMessage: normalizeText(error.message, `HTTP ${error.status}`),
    };
  }
  if (error instanceof Error && error.name === "AbortError") {
    return {
      reasonCode: "timeout",
      reasonMessage: "请求超时",
    };
  }

  const message = normalizeText(error instanceof Error ? error.message : String(error), "unknown error");
  if (/fetch failed|network|econn|enotfound|socket|tls/i.test(message)) {
    return {
      reasonCode: "network_error",
      reasonMessage: message,
    };
  }

  return {
    reasonCode: "unknown_error",
    reasonMessage: message,
  };
}

async function callOpenAiLike(config: LlmRuntimeConfig, prompt: string): Promise<{ text: string; raw: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        input: prompt,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new LlmRequestError(response.status, String((payload as any)?.error?.message || (payload as any)?.message || `http ${response.status}`));
    }

    return {
      text: extractTextFromOpenAiLike(payload),
      raw: payload,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function callPackyCode(config: LlmRuntimeConfig, prompt: string): Promise<{ text: string; raw: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: config.apiKey ? `Bearer ${config.apiKey}` : "",
      },
      body: JSON.stringify({
        model: config.model,
        prompt,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new LlmRequestError(response.status, String((payload as any)?.error || (payload as any)?.message || `http ${response.status}`));
    }

    const text = normalizeText((payload as any)?.text)
      || normalizeText((payload as any)?.output)
      || normalizeText((payload as any)?.answer)
      || extractTextFromOpenAiLike(payload);

    return { text, raw: payload };
  } finally {
    clearTimeout(timer);
  }
}

export async function runLlmAnalysis(input: DaaLlmAnalysisInput): Promise<DaaLlmAnalysis> {
  const startedAt = Date.now();
  const config = await resolveLlmRuntimeConfig();
  const analysisFocus = normalizeText(input.analysisFocus);
  const generatedAt = new Date().toISOString();
  const sharedMarketMeta = {
    marketRegime: input.marketContext?.regime || null,
    marketFacts: buildMarketFactsFromContext(input.marketContext),
  };

  if (!analysisFocus) {
    return {
      status: "error",
      provider: config.provider,
      model: config.model,
      generatedAt,
      summary: "LLM 二次分析失败：analysisFocus 不能为空。",
      opportunityNotes: [],
      riskNotes: [],
      latencyMs: Date.now() - startedAt,
      reasonCode: "analysis_focus_required",
      reasonMessage: "analysisFocus 不能为空",
      failedAt: generatedAt,
      reason: "analysisFocus is required",
      ...sharedMarketMeta,
    };
  }

  if (!config.enabled) {
    return {
      status: "skipped",
      provider: config.provider,
      model: config.model,
      generatedAt,
      summary: "LLM 二次分析未启用。",
      opportunityNotes: [],
      riskNotes: [],
      latencyMs: Date.now() - startedAt,
      reasonCode: "llm_disabled",
      reasonMessage: "llm_analysis data source disabled",
      reason: "llm_analysis data source disabled",
      ...sharedMarketMeta,
    };
  }

  if (input.analysisContext === "decision" && !config.enabledInDecision) {
    return {
      status: "skipped",
      provider: config.provider,
      model: config.model,
      generatedAt,
      summary: "LLM 二次分析在决策链路中未启用。",
      opportunityNotes: [],
      riskNotes: [],
      latencyMs: Date.now() - startedAt,
      reasonCode: "llm_disabled_in_decision",
      reasonMessage: "llm_analysis disabled in decision context",
      reason: "llm_analysis disabled in decision context",
      ...sharedMarketMeta,
    };
  }

  if (!config.endpoint) {
    return {
      status: "skipped",
      provider: config.provider,
      model: config.model,
      generatedAt,
      summary: "LLM 二次分析已启用但缺少 endpoint。",
      opportunityNotes: [],
      riskNotes: [],
      latencyMs: Date.now() - startedAt,
      reasonCode: "missing_endpoint",
      reasonMessage: "missing endpoint",
      reason: "missing endpoint",
      ...sharedMarketMeta,
    };
  }

  if (!config.apiKey) {
    return {
      status: "skipped",
      provider: config.provider,
      model: config.model,
      generatedAt,
      summary: "LLM 二次分析已启用但缺少 API Key。",
      opportunityNotes: [],
      riskNotes: [],
      latencyMs: Date.now() - startedAt,
      reasonCode: "missing_api_key",
      reasonMessage: "missing api key",
      reason: "missing api key",
      ...sharedMarketMeta,
    };
  }

  try {
    const prompt = buildPrompt({
      ...input,
      analysisFocus,
    });

    const result = config.provider === "packycode"
      ? await callPackyCode(config, prompt)
      : await callOpenAiLike(config, prompt);

    const parsed = splitAnalysisText(result.text);

    return {
      status: "ok",
      provider: config.provider,
      model: config.model,
      generatedAt: new Date().toISOString(),
      summary: parsed.summary,
      opportunityNotes: parsed.opportunityNotes,
      riskNotes: parsed.riskNotes,
      latencyMs: Date.now() - startedAt,
      raw: result.raw,
      ...sharedMarketMeta,
    };
  } catch (error) {
    const failedAt = new Date().toISOString();
    const failure = resolveFailure(error);
    return {
      status: "error",
      provider: config.provider,
      model: config.model,
      generatedAt: failedAt,
      summary: "LLM 二次分析失败（严格模式）。",
      opportunityNotes: [],
      riskNotes: [],
      latencyMs: Date.now() - startedAt,
      reasonCode: failure.reasonCode,
      reasonMessage: failure.reasonMessage,
      failedAt,
      reason: failure.reasonMessage,
      ...sharedMarketMeta,
    };
  }
}
