import type { DaaMarketIndicatorSnapshot, MacroCyclePhase } from "./marketContextTypes";

export type MacroCycleResult = {
  phase: MacroCyclePhase;
  growthProxy: number;
  inflationProxy: number;
  confidence: number;
  label: string;
  favoredAssets: string[];
};

export type FredMacroInput = {
  gdpGrowthPct: number | null;  // e.g. 2.5 means 2.5% growth
  cpiYoYPct: number | null;     // e.g. 3.1 means 3.1% inflation
  unemploymentPct: number | null;
};

const PHASE_META: Record<MacroCyclePhase, { label: string; favoredAssets: string[] }> = {
  recovery:    { label: "复苏", favoredAssets: ["股票", "周期品"] },
  overheating: { label: "过热", favoredAssets: ["大宗商品", "TIPS"] },
  stagflation: { label: "滞胀", favoredAssets: ["现金", "黄金"] },
  deflation:   { label: "衰退", favoredAssets: ["债券", "防御股"] },
};

/**
 * 使用 FRED 真实宏观数据 + ETF 代理指标进行宏观周期分类
 *
 * - FRED 数据可用时：使用真实 GDP/CPI，置信度较高 (80%)
 * - FRED 数据部分可用：混合真实数据与代理指标
 * - FRED 数据不可用：回退到纯代理指标分类
 */
export function classifyMacroCycleWithFred(
  fredData: FredMacroInput | null,
  proxyIndicators: DaaMarketIndicatorSnapshot[],
): MacroCycleResult | null {
  // 从代理指标提取增长/通胀信号
  const breadth = proxyIndicators.find(i => i.key === "market_breadth");
  const qqqSpy = proxyIndicators.find(i => i.key === "qqq_spy_ratio");
  const inflation = proxyIndicators.find(i => i.key === "inflation_expectation");

  // 判断 FRED 数据可用性
  const hasGdp = fredData?.gdpGrowthPct != null && Number.isFinite(fredData.gdpGrowthPct);
  const hasCpi = fredData?.cpiYoYPct != null && Number.isFinite(fredData.cpiYoYPct);
  const hasAnyFred = hasGdp || hasCpi;

  // 如果既没有 FRED 数据也没有足够的代理指标，无法分类
  if (!hasAnyFred && !inflation) return null;

  // ── 增长维度 ──
  let growthProxy: number;
  let growthConfidence: number;

  if (hasGdp) {
    // FRED GDP 增长率：>2% 视为高增长 (映射到 0-100 范围)
    // 0% → 25, 2% → 50, 4% → 75, 6% → 100, -2% → 0
    growthProxy = Math.max(0, Math.min(100, (fredData!.gdpGrowthPct! + 2) * 12.5));
    growthConfidence = 80;
  } else {
    // 回退到代理指标
    if (breadth?.percentile252 != null && qqqSpy?.trend30dPct != null) {
      const trendNorm = Math.max(0, Math.min(100, (qqqSpy.trend30dPct + 5) * 10));
      growthProxy = breadth.percentile252 * 0.6 + trendNorm * 0.4;
    } else if (breadth?.percentile252 != null) {
      growthProxy = breadth.percentile252;
    } else if (qqqSpy?.trend30dPct != null) {
      growthProxy = Math.max(0, Math.min(100, (qqqSpy.trend30dPct + 5) * 10));
    } else {
      // 没有增长数据，只有通胀数据时，默认中性增长
      growthProxy = 50;
    }
    growthConfidence = 50;
  }

  // ── 通胀维度 ──
  let inflationProxy: number;
  let inflationConfidence: number;

  if (hasCpi) {
    // FRED CPI YoY：>3% 视为高通胀 (映射到 0-100 范围)
    // 0% → 10, 2% → 40, 3% → 55, 5% → 85, 8% → 100
    inflationProxy = Math.max(0, Math.min(100, fredData!.cpiYoYPct! * 12.5));
    inflationConfidence = 80;
  } else if (inflation) {
    inflationProxy = inflation.percentile252 ?? 50;
    inflationConfidence = inflation.confidencePct ?? 50;
  } else {
    // 没有通胀数据但有增长数据时，默认中性通胀
    inflationProxy = 50;
    inflationConfidence = 30;
  }

  // ── 分类 ──
  const highGrowth = growthProxy > 50;
  const highInflation = inflationProxy > 50;

  let phase: MacroCyclePhase;
  if (highGrowth && !highInflation) phase = "recovery";
  else if (highGrowth && highInflation) phase = "overheating";
  else if (!highGrowth && highInflation) phase = "stagflation";
  else phase = "deflation";

  const meta = PHASE_META[phase];
  const confidence = Math.min(growthConfidence, inflationConfidence);

  return {
    phase,
    growthProxy: Math.round(growthProxy * 10) / 10,
    inflationProxy: Math.round(inflationProxy * 10) / 10,
    confidence,
    label: meta.label,
    favoredAssets: meta.favoredAssets,
  };
}

