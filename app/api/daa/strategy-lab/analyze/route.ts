import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { callLlm, resolveLlmConfig } from "@/src/daa/llm/llmClient";
import type { StrategyLabAiAnalysis, StrategyLabRunResult } from "@/src/daa/modules/strategyLab/strategyLabTypes";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

type Body = {
  result?: unknown;
};

type CompactBacktestSummary = {
  baseCurrency: string;
  period: string;
  params: {
    assets: string[];
    strategies: string[];
    rebalanceFrequency: string;
    initialCapital: number;
    minOrderNotional?: number;
  };
  strategies: Array<{
    name: string;
    totalReturnPct: number;
    annualizedReturnPct: number;
    sharpe: number;
    maxDrawdownPct: number;
    winRatePct: number;
  }>;
  benchmarks: Array<{
    name: string;
    symbol: string;
    totalReturnPct: number | null;
    coverage: string;
  }>;
  attribution: Array<{
    symbol: string;
    avgWeightPct: number;
    assetReturnPct: number;
    contributionPct: number;
  }>;
  rebalanceEvents: number;
  warningCount: number;
  warningSamples: string[];
};

function toPct(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Number((value * 100).toFixed(2));
}

function compactResult(result: StrategyLabRunResult): CompactBacktestSummary {
  return {
    baseCurrency: result.baseCurrency,
    period: `${result.params.startDate} ~ ${result.params.endDate}`,
    params: {
      assets: result.params.assets,
      strategies: result.params.strategies,
      rebalanceFrequency: result.params.rebalanceFrequency,
      initialCapital: result.params.initialCapital,
      minOrderNotional: result.params.minOrderNotional,
    },
    strategies: result.strategyResults.map((item) => ({
      name: item.strategy,
      totalReturnPct: toPct(item.metrics.totalReturn) ?? 0,
      annualizedReturnPct: toPct(item.metrics.annualizedReturn) ?? 0,
      sharpe: Number(item.metrics.sharpe.toFixed(2)),
      maxDrawdownPct: toPct(item.metrics.maxDrawdown) ?? 0,
      winRatePct: toPct(item.metrics.winRate) ?? 0,
    })),
    benchmarks: (result.benchmarkResults ?? []).map((item) => ({
      name: item.label,
      symbol: item.symbol,
      totalReturnPct: toPct(item.return),
      coverage: item.coverage,
    })),
    attribution: result.attribution.perAsset
      .slice()
      .sort((a, b) => Math.abs(b.contributionToReturn) - Math.abs(a.contributionToReturn))
      .slice(0, 8)
      .map((item) => ({
        symbol: item.symbol,
        avgWeightPct: toPct(item.avgWeight) ?? 0,
        assetReturnPct: toPct(item.assetReturn) ?? 0,
        contributionPct: toPct(item.contributionToReturn) ?? 0,
      })),
    rebalanceEvents: result.attribution.rebalanceEvents.length,
    warningCount: result.warnings.length,
    warningSamples: result.warnings.slice(0, 8),
  };
}

function localAnalysis(summary: CompactBacktestSummary): StrategyLabAiAnalysis {
  const bestSharpe = summary.strategies.slice().sort((a, b) => b.sharpe - a.sharpe)[0];
  const bestReturn = summary.strategies.slice().sort((a, b) => b.totalReturnPct - a.totalReturnPct)[0];
  const worstDrawdown = summary.strategies.slice().sort((a, b) => a.maxDrawdownPct - b.maxDrawdownPct)[0];
  const bestBenchmark = summary.benchmarks
    .filter((item) => item.totalReturnPct != null)
    .sort((a, b) => (b.totalReturnPct ?? -Infinity) - (a.totalReturnPct ?? -Infinity))[0];

  return {
    source: "local",
    summary: [
      bestReturn ? `收益最高的是 ${bestReturn.name}，总收益 ${bestReturn.totalReturnPct.toFixed(2)}%。` : "暂无可比较的策略收益。",
      bestSharpe ? `风险调整后表现最好的是 ${bestSharpe.name}，夏普 ${bestSharpe.sharpe.toFixed(2)}。` : "暂无可比较的夏普数据。",
      bestBenchmark ? `基准中 ${bestBenchmark.name} 总收益为 ${bestBenchmark.totalReturnPct?.toFixed(2)}%，可作为策略表现的外部参照。` : "基准收益数据不足，暂不能做完整外部对照。",
    ],
    risks: [
      worstDrawdown ? `${worstDrawdown.name} 的最大回撤为 ${worstDrawdown.maxDrawdownPct.toFixed(2)}%，需要和收益一起看。` : "暂无最大回撤数据。",
      summary.warningCount > 0 ? `本次回测有 ${summary.warningCount} 条说明/约束，尤其要关注现金不足和最小下单额导致的目标偏离。` : "本次回测未返回显著约束提醒。",
    ],
    suggestions: [
      "优先比较夏普、最大回撤和总收益的一致性，不建议只按总收益排序。",
      "若下单约束提醒较多，可降低最小下单额、提高初始资金，或减少资产数量后重新回测。",
      "用近 1 年、近 3 年、近 5 年分别复跑，观察策略排序是否稳定。",
    ],
  };
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6);
}

function parseAnalysisJson(text: string): StrategyLabAiAnalysis | null {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
  if (!match) return null;
  const parsed = JSON.parse(match[1].trim()) as Record<string, unknown>;
  const summary = normalizeStringList(parsed.summary);
  const risks = normalizeStringList(parsed.risks);
  const suggestions = normalizeStringList(parsed.suggestions);
  if (!summary.length && !risks.length && !suggestions.length) return null;
  return { source: "llm", summary, risks, suggestions };
}

async function llmAnalysis(summary: CompactBacktestSummary): Promise<StrategyLabAiAnalysis | null> {
  const config = await resolveLlmConfig("analysis");
  if (!config.enabled || !config.apiKey) return null;

  const prompt = [
    "你是一个投资组合回测分析助手。请基于输入的结构化回测摘要，用中文给出简洁、审慎、可执行的分析。",
    "只输出 JSON，不要输出 markdown。JSON 格式：",
    '{"summary":["..."],"risks":["..."],"suggestions":["..."]}',
    "要求：summary 2-4 条，risks 2-4 条，suggestions 2-4 条；必须同时参考策略、基准、回撤、夏普和下单约束；不要给出保证收益或投资承诺。",
    "",
    "回测摘要：",
    JSON.stringify(summary, null, 2),
  ].join("\n");

  try {
    const { text } = await callLlm(config, prompt);
    return parseAnalysisJson(text);
  } catch (error) {
    logSwallowed("strategyLabAnalyze.llm", error);
    return null;
  }
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<Body>(req);
    const result = body?.result as StrategyLabRunResult | undefined;
    if (!result || !result.params || !Array.isArray(result.strategyResults)) {
      return fail("VALIDATION_FAILED", "result 不能为空", { status: 400 });
    }

    const summary = compactResult(result);
    const analysis = await llmAnalysis(summary);
    return ok(analysis ?? localAnalysis(summary));
  });
}
