import type { DaaMarketIndicatorSnapshot, MacroCyclePhase } from "./marketContextTypes";

export type MacroCycleResult = {
  phase: MacroCyclePhase;
  growthProxy: number;
  inflationProxy: number;
  confidence: number;
  label: string;
  favoredAssets: string[];
};

const PHASE_META: Record<MacroCyclePhase, { label: string; favoredAssets: string[] }> = {
  recovery:    { label: "复苏", favoredAssets: ["股票", "周期品"] },
  overheating: { label: "过热", favoredAssets: ["大宗商品", "TIPS"] },
  stagflation: { label: "滞胀", favoredAssets: ["现金", "黄金"] },
  deflation:   { label: "衰退", favoredAssets: ["债券", "防御股"] },
};

export function classifyMacroCycle(indicators: DaaMarketIndicatorSnapshot[]): MacroCycleResult | null {
  // Find growth proxies
  const breadth = indicators.find(i => i.key === "market_breadth");
  const qqqSpy = indicators.find(i => i.key === "qqq_spy_ratio");
  // Find inflation proxy
  const inflation = indicators.find(i => i.key === "inflation_expectation");

  if (!inflation) return null;  // Need at least inflation proxy

  // Growth dimension: breadth percentile (60%) + QQQ/SPY trend (40%)
  let growthProxy: number;
  if (breadth?.percentile252 != null && qqqSpy?.trend30dPct != null) {
    // Normalize trend30d to 0-100 scale (rough: +5% → 100, -5% → 0)
    const trendNorm = Math.max(0, Math.min(100, (qqqSpy.trend30dPct + 5) * 10));
    growthProxy = breadth.percentile252 * 0.6 + trendNorm * 0.4;
  } else if (breadth?.percentile252 != null) {
    growthProxy = breadth.percentile252;
  } else if (qqqSpy?.trend30dPct != null) {
    growthProxy = Math.max(0, Math.min(100, (qqqSpy.trend30dPct + 5) * 10));
  } else {
    return null;  // No growth data
  }

  const inflationProxy = inflation.percentile252 ?? 50;

  // Classify: >50 = "rising", <=50 = "falling"
  const highGrowth = growthProxy > 50;
  const highInflation = inflationProxy > 50;

  let phase: MacroCyclePhase;
  if (highGrowth && !highInflation) phase = "recovery";
  else if (highGrowth && highInflation) phase = "overheating";
  else if (!highGrowth && highInflation) phase = "stagflation";
  else phase = "deflation";

  const meta = PHASE_META[phase];
  const confidence = Math.min(
    breadth?.confidencePct ?? 50,
    inflation?.confidencePct ?? 50,
    qqqSpy?.confidencePct ?? 50,
  );

  return {
    phase,
    growthProxy: Math.round(growthProxy * 10) / 10,
    inflationProxy: Math.round(inflationProxy * 10) / 10,
    confidence,
    label: meta.label,
    favoredAssets: meta.favoredAssets,
  };
}
