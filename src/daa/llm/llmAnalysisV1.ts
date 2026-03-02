import { listDaaDataSourcesV1 } from "@/src/daa/store/daaStorePgV1";
import { DEFAULT_ANALYSIS_FOCUS_V1 } from "@/src/daa/llm/analysisFocusDefaultsV1";

export type DaaLlmAnalysisStatusV1 = "skipped" | "ok" | "error";
export type DaaLlmAnalysisContextV1 = "decision" | "insight" | "digest";

export type DaaLlmAnalysisV1 = {
  status: DaaLlmAnalysisStatusV1;
  provider: string;
  model: string;
  generatedAt: string;
  summary: string;
  opportunityNotes: string[];
  riskNotes: string[];
  latencyMs: number;
  reason?: string;
  raw?: unknown;
};

export type DaaLlmAnalysisInputV1 = {
  analysisContext: DaaLlmAnalysisContextV1;
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
};

export { DEFAULT_ANALYSIS_FOCUS_V1 };

type LlmRuntimeConfigV1 = {
  enabled: boolean;
  enabledInDecision: boolean;
  provider: string;
  model: string;
  endpoint: string;
  apiKey: string;
  timeoutMs: number;
};

function normalizeText(value: unknown, fallback = ""): string {
  const text = String(value || "").trim();
  return text || fallback;
}

function toFinite(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function resolveLlmRuntimeConfigV1(): Promise<LlmRuntimeConfigV1> {
  const sources = await listDaaDataSourcesV1("llm_analysis");
  const source = sources.find((item) => item.enabled) ?? sources[0] ?? null;
  const config = source?.configJson && typeof source.configJson === "object" ? source.configJson : {};

  const provider = normalizeText((config as any).provider, "codex").toLowerCase();
  const model = normalizeText((config as any).model, provider === "packycode" ? "packycode-default" : "gpt-5-codex");
  const timeoutMs = Math.max(2000, Math.min(20000, Math.trunc(toFinite((config as any).timeoutMs, 8000))));

  const endpoint = normalizeText(
    (config as any).endpoint,
    provider === "packycode"
      ? normalizeText(process.env.PACKYCODE_ENDPOINT)
      : normalizeText(process.env.DAA_LLM_ENDPOINT, "https://api.openai.com/v1/responses"),
  );

  const apiKey = normalizeText(
    (config as any).apiKey,
    provider === "packycode"
      ? normalizeText(process.env.PACKYCODE_API_KEY)
      : normalizeText(process.env.OPENAI_API_KEY),
  );

  const enabled = Boolean(source?.enabled);
  const enabledInDecision = (config as any).enabledInDecision !== false;

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

function buildPromptV1(input: DaaLlmAnalysisInputV1): string {
  const top = input.opportunities.slice(0, 8).map((item, index) => (
    `${index + 1}. ${item.symbol} | score=${item.finalScorePct.toFixed(1)} | confidence=${item.confidencePct.toFixed(1)} | risk=${item.riskScorePct.toFixed(1)} | action=${item.action} | reasons=${item.reasons.slice(0, 3).join(";")}`
  )).join("\n");

  const warningText = input.warnings.slice(0, 8).join("; ") || "无";

  return [
    "你是DAA投资风控分析助手，请仅输出结构化结论，不要给下单指令。",
    `基准币种: ${input.baseCurrency}`,
    `再平衡触发: ${input.shouldRebalance ? "是" : "否"}`,
    `分析关注点: ${input.analysisFocus}`,
    `机会列表:\n${top || "无"}`,
    `系统告警: ${warningText}`,
    "请返回三段内容：",
    "1) summary：一句总体判断",
    "2) opportunity_notes：3-5条机会说明",
    "3) risk_notes：3-5条风险提示",
  ].join("\n");
}

function extractTextFromOpenAiLikeV1(payload: any): string {
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

function splitAnalysisTextV1(text: string): { summary: string; opportunityNotes: string[]; riskNotes: string[] } {
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

async function callOpenAiLikeV1(config: LlmRuntimeConfigV1, prompt: string): Promise<{ text: string; raw: unknown }> {
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
      throw new Error(String((payload as any)?.error?.message || (payload as any)?.message || `http ${response.status}`));
    }

    return {
      text: extractTextFromOpenAiLikeV1(payload),
      raw: payload,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function callPackyCodeV1(config: LlmRuntimeConfigV1, prompt: string): Promise<{ text: string; raw: unknown }> {
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
      throw new Error(String((payload as any)?.error || (payload as any)?.message || `http ${response.status}`));
    }

    const text = normalizeText((payload as any)?.text)
      || normalizeText((payload as any)?.output)
      || normalizeText((payload as any)?.answer)
      || extractTextFromOpenAiLikeV1(payload);

    return { text, raw: payload };
  } finally {
    clearTimeout(timer);
  }
}

export async function runLlmAnalysisV1(input: DaaLlmAnalysisInputV1): Promise<DaaLlmAnalysisV1> {
  const startedAt = Date.now();
  const config = await resolveLlmRuntimeConfigV1();
  const analysisFocus = normalizeText(input.analysisFocus);

  if (!analysisFocus) {
    return {
      status: "error",
      provider: config.provider,
      model: config.model,
      generatedAt: new Date().toISOString(),
      summary: "LLM 二次分析失败：analysisFocus 不能为空。",
      opportunityNotes: [],
      riskNotes: [],
      latencyMs: Date.now() - startedAt,
      reason: "analysisFocus is required",
    };
  }

  if (!config.enabled) {
    return {
      status: "skipped",
      provider: config.provider,
      model: config.model,
      generatedAt: new Date().toISOString(),
      summary: "LLM 二次分析未启用。",
      opportunityNotes: [],
      riskNotes: [],
      latencyMs: Date.now() - startedAt,
      reason: "llm_analysis data source disabled",
    };
  }

  if (input.analysisContext === "decision" && !config.enabledInDecision) {
    return {
      status: "skipped",
      provider: config.provider,
      model: config.model,
      generatedAt: new Date().toISOString(),
      summary: "LLM 二次分析在决策链路中未启用。",
      opportunityNotes: [],
      riskNotes: [],
      latencyMs: Date.now() - startedAt,
      reason: "llm_analysis disabled in decision context",
    };
  }

  if (!config.endpoint) {
    return {
      status: "skipped",
      provider: config.provider,
      model: config.model,
      generatedAt: new Date().toISOString(),
      summary: "LLM 二次分析已启用但缺少 endpoint。",
      opportunityNotes: [],
      riskNotes: [],
      latencyMs: Date.now() - startedAt,
      reason: "missing endpoint",
    };
  }

  if (!config.apiKey) {
    return {
      status: "skipped",
      provider: config.provider,
      model: config.model,
      generatedAt: new Date().toISOString(),
      summary: "LLM 二次分析已启用但缺少 API Key。",
      opportunityNotes: [],
      riskNotes: [],
      latencyMs: Date.now() - startedAt,
      reason: "missing api key",
    };
  }

  try {
    const prompt = buildPromptV1({
      ...input,
      analysisFocus,
    });

    const result = config.provider === "packycode"
      ? await callPackyCodeV1(config, prompt)
      : await callOpenAiLikeV1(config, prompt);

    const parsed = splitAnalysisTextV1(result.text);

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
    };
  } catch (error) {
    return {
      status: "error",
      provider: config.provider,
      model: config.model,
      generatedAt: new Date().toISOString(),
      summary: "LLM 二次分析失败，已回退到规则引擎结果。",
      opportunityNotes: [],
      riskNotes: [],
      latencyMs: Date.now() - startedAt,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
