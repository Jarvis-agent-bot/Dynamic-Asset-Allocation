import type { AssetFundamentals } from "@/app/daa/dashboard/_hooks/useFundamentals";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";

export type ValuationTone = "cheap" | "fair" | "expensive" | "danger" | "muted";

export type ValuationBadge = {
  label: string;
  tone: ValuationTone;
  reason: string;
  description: string;
};

function isStock(row: AssetUniverseView): boolean {
  return row.assetClass === "EQUITY" || row.instrumentType === "STOCK";
}

export function formatFundamentalRatio(value: number | null | undefined): string {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value).toFixed(2) : "--";
}

export function formatCompanyMarketCap(value: number | null | undefined, currencyRaw: string | null | undefined): string {
  if (!Number.isFinite(value) || Number(value) <= 0) return "--";
  const currency = String(currencyRaw || "USD").trim().toUpperCase() || "USD";
  try {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(Number(value));
  } catch {
    return `${currency} ${new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(Number(value))}`;
  }
}

function formatPercentile(value: number | null | undefined): string {
  return Number.isFinite(value) ? `${Math.round(Number(value))}%` : "--";
}

function byHistoricalPercentile(input: {
  metricLabel: string;
  value: number;
  percentile: number;
  sampleCount: number;
}): ValuationBadge {
  const ratioText = `${input.metricLabel} ${input.value.toFixed(2)}`;
  const percentileText = `自身历史 ${formatPercentile(input.percentile)} 分位`;
  const reason = `${ratioText}，${percentileText}`;
  if (input.percentile <= 25) {
    return {
      label: "偏便宜",
      tone: "cheap",
      reason,
      description: `${reason}。这是相对自身历史的估值判断，样本 ${input.sampleCount} 条。`,
    };
  }
  if (input.percentile <= 65) {
    return {
      label: "合理",
      tone: "fair",
      reason,
      description: `${reason}。估值处在自身历史中部区域，仍需结合增长和行业景气度。`,
    };
  }
  if (input.percentile <= 85) {
    return {
      label: "偏贵",
      tone: "expensive",
      reason,
      description: `${reason}。估值已经高于自身大部分历史样本，买入需要更强基本面证据。`,
    };
  }
  return {
    label: "昂贵",
    tone: "danger",
    reason,
    description: `${reason}。估值处于自身历史高位，容错率较低。`,
  };
}

function byPeerPercentile(input: {
  metricLabel: string;
  value: number;
  percentile: number;
  sampleCount: number;
  groupLabel: string;
  median: number | null | undefined;
}): ValuationBadge {
  const ratioText = `${input.metricLabel} ${input.value.toFixed(2)}`;
  const medianText = Number.isFinite(input.median) ? `，同业中位 ${Number(input.median).toFixed(2)}` : "";
  const reason = `${ratioText}，${input.groupLabel} ${formatPercentile(input.percentile)} 分位`;
  if (input.percentile <= 25) {
    return {
      label: "偏便宜",
      tone: "cheap",
      reason,
      description: `${reason}${medianText}。这是 Yahoo 同业横截面估值判断，样本 ${input.sampleCount} 个。`,
    };
  }
  if (input.percentile <= 65) {
    return {
      label: "合理",
      tone: "fair",
      reason,
      description: `${reason}${medianText}。这是 Yahoo 同业横截面估值判断，样本 ${input.sampleCount} 个；相对同业处于中部区域，仍需结合增长和行业景气度。`,
    };
  }
  if (input.percentile <= 85) {
    return {
      label: "偏贵",
      tone: "expensive",
      reason,
      description: `${reason}${medianText}。这是 Yahoo 同业横截面估值判断，样本 ${input.sampleCount} 个；相对同业估值已经偏高，买入需要更强基本面证据。`,
    };
  }
  return {
    label: "昂贵",
    tone: "danger",
    reason,
    description: `${reason}${medianText}。这是 Yahoo 同业横截面估值判断，样本 ${input.sampleCount} 个；相对同业处于高位，容错率较低。`,
  };
}

function byAbsoluteFallback(input: { metricLabel: string; value: number; cheap: number; fair: number; expensive: number }): ValuationBadge {
  const reason = `${input.metricLabel} ${input.value.toFixed(2)}，自身历史样本不足`;
  if (input.value <= input.cheap) {
    return { label: "偏便宜", tone: "cheap", reason, description: `${reason}；暂时用绝对阈值辅助判断。` };
  }
  if (input.value <= input.fair) {
    return { label: "合理", tone: "fair", reason, description: `${reason}；暂时用绝对阈值辅助判断。` };
  }
  if (input.value <= input.expensive) {
    return { label: "偏贵", tone: "expensive", reason, description: `${reason}；暂时用绝对阈值辅助判断。` };
  }
  return { label: "昂贵", tone: "danger", reason, description: `${reason}；暂时用绝对阈值辅助判断。` };
}

function historyStatsText(stats: AssetFundamentals["peHistory"]): string | null {
  if (!stats) return null;
  const span = stats.spanDays == null ? "跨度未知" : `跨度 ${stats.spanDays} 天`;
  const range = stats.min != null && stats.max != null
    ? `区间 ${stats.min.toFixed(2)}-${stats.max.toFixed(2)}`
    : "区间不足";
  return `样本 ${stats.sampleCount}/${stats.minSampleCount}，${span}/${stats.minSpanDays} 天，${range}`;
}

function withHistoryStatsDescription(badge: ValuationBadge, stats: AssetFundamentals["peHistory"]): ValuationBadge {
  const text = historyStatsText(stats);
  if (!text) return badge;
  return {
    ...badge,
    description: `${badge.description} 当前不展示历史百分位：${text}。`,
  };
}

function peerStatsText(fundamentals: AssetFundamentals | null | undefined, metric: "pe" | "pb"): string | null {
  const sampleCount = metric === "pe" ? fundamentals?.pePeerSampleCount : fundamentals?.pbPeerSampleCount;
  const percentile = metric === "pe" ? fundamentals?.pePeerPercentile : fundamentals?.pbPeerPercentile;
  const median = metric === "pe" ? fundamentals?.pePeerMedian : fundamentals?.pbPeerMedian;
  const groupLabel = fundamentals?.peerGroupLabel;
  const minSampleCount = fundamentals?.peerMinSampleCount ?? 5;
  if (!groupLabel || !Number.isFinite(sampleCount)) return null;
  const parts = [`${groupLabel} 样本 ${Number(sampleCount)}/${minSampleCount}`];
  if (Number.isFinite(percentile)) parts.push(`分位 ${formatPercentile(percentile)}`);
  if (Number.isFinite(median)) parts.push(`中位 ${Number(median).toFixed(2)}`);
  return parts.join("，");
}

function withPeerStatsDescription(badge: ValuationBadge, fundamentals: AssetFundamentals | null | undefined, metric: "pe" | "pb"): ValuationBadge {
  const text = peerStatsText(fundamentals, metric);
  if (!text) return badge;
  return {
    ...badge,
    description: `${badge.description} 同业横截面：${text}。`,
  };
}

function formatPct(value: number | null | undefined): string | null {
  return Number.isFinite(value) ? `${Number(value).toFixed(1)}%` : null;
}

function appendSecondaryMetrics(description: string, fundamentals: AssetFundamentals | null | undefined): string {
  const parts: string[] = [];
  if (Number.isFinite(fundamentals?.pbRatio) && Number(fundamentals?.pbRatio) > 0) {
    parts.push(`PB ${Number(fundamentals?.pbRatio).toFixed(2)}`);
  }
  const dividend = formatPct(fundamentals?.dividendYieldPct);
  if (dividend) parts.push(`股息率 ${dividend}`);
  const margin = formatPct(fundamentals?.profitMarginsPct);
  if (margin) parts.push(`净利率 ${margin}`);
  if (parts.length === 0) return description;
  return `${description} 辅助指标：${parts.join("，")}。`;
}

export function deriveValuationBadge(row: AssetUniverseView, fundamentals: AssetFundamentals | null | undefined): ValuationBadge {
  if (!isStock(row)) {
    return {
      label: "不适用",
      tone: "muted",
      reason: "基本面估值不适用于此类资产",
      description: "PE、PB、股息率主要适合个股，ETF、债券、商品和加密资产需要看不同指标。",
    };
  }

  const pe = fundamentals?.trailingPE ?? null;
  if (Number.isFinite(pe) && Number(pe) > 0) {
    const percentile = fundamentals?.pePercentile ?? null;
    if (Number.isFinite(percentile) && fundamentals?.peHistory?.eligible) {
      return appendBadgeDescription(byHistoricalPercentile({
        metricLabel: "PE(TTM)",
        value: Number(pe),
        percentile: Number(percentile),
        sampleCount: fundamentals.peSampleCount,
      }), fundamentals);
    }
    const peerPercentile = fundamentals?.pePeerPercentile ?? null;
    const peerSampleCount = fundamentals?.pePeerSampleCount ?? 0;
    const peerMinSampleCount = fundamentals?.peerMinSampleCount ?? 5;
    if (Number.isFinite(peerPercentile) && peerSampleCount >= peerMinSampleCount) {
      return appendBadgeDescription(byPeerPercentile({
        metricLabel: "PE(TTM)",
        value: Number(pe),
        percentile: Number(peerPercentile),
        sampleCount: peerSampleCount,
        groupLabel: fundamentals?.peerGroupLabel || "同业",
        median: fundamentals?.pePeerMedian,
      }), fundamentals);
    }
    return appendBadgeDescription(withPeerStatsDescription(withHistoryStatsDescription(
      byAbsoluteFallback({ metricLabel: "PE(TTM)", value: Number(pe), cheap: 15, fair: 30, expensive: 45 }),
      fundamentals?.peHistory,
    ), fundamentals, "pe"), fundamentals);
  }

  const pb = fundamentals?.pbRatio ?? null;
  if (Number.isFinite(pb) && Number(pb) > 0) {
    const peerPercentile = fundamentals?.pbPeerPercentile ?? null;
    const peerSampleCount = fundamentals?.pbPeerSampleCount ?? 0;
    const peerMinSampleCount = fundamentals?.peerMinSampleCount ?? 5;
    if (Number.isFinite(peerPercentile) && peerSampleCount >= peerMinSampleCount) {
      return appendBadgeDescription(byPeerPercentile({
        metricLabel: "PB",
        value: Number(pb),
        percentile: Number(peerPercentile),
        sampleCount: peerSampleCount,
        groupLabel: fundamentals?.peerGroupLabel || "同业",
        median: fundamentals?.pbPeerMedian,
      }), fundamentals);
    }
    return appendBadgeDescription(withPeerStatsDescription(
      byAbsoluteFallback({ metricLabel: "PB", value: Number(pb), cheap: 1.5, fair: 3.5, expensive: 6 }),
      fundamentals,
      "pb",
    ), fundamentals);
  }

  return {
    label: "数据不足",
    tone: "muted",
    reason: "暂未拿到 PE / PB 数据",
    description: "暂未拿到可用的 PE / PB 数据。",
  };
}

function appendBadgeDescription(badge: ValuationBadge, fundamentals: AssetFundamentals | null | undefined): ValuationBadge {
  return {
    ...badge,
    description: appendSecondaryMetrics(badge.description, fundamentals),
  };
}

function preferredGrowthMetric(fundamentals: AssetFundamentals | null | undefined): { label: string; value: number } | null {
  const earningsGrowth = fundamentals?.earningsGrowthPct;
  if (Number.isFinite(earningsGrowth)) return { label: "盈利增速", value: Number(earningsGrowth) };
  const revenueGrowth = fundamentals?.revenueGrowthPct;
  if (Number.isFinite(revenueGrowth)) return { label: "收入增速", value: Number(revenueGrowth) };
  return null;
}

function growthRequirementFromPeOnly(pe: number): ValuationBadge {
  if (pe <= 15) {
    return { label: "要求较低", tone: "cheap", reason: `PE ${pe.toFixed(2)}，缺少增长数据`, description: "当前 PE 不高，即使暂未拿到增长字段，未来增长兑现压力也相对低。" };
  }
  if (pe <= 25) {
    return { label: "要求适中", tone: "fair", reason: `PE ${pe.toFixed(2)}，缺少增长数据`, description: "当前 PE 处于中等区间，需要基本面维持稳健。" };
  }
  if (pe <= 40) {
    return { label: "要求较高", tone: "expensive", reason: `PE ${pe.toFixed(2)}，缺少增长数据`, description: "当前 PE 已经偏高，需要后续收入或盈利继续兑现。" };
  }
  return { label: "要求极高", tone: "danger", reason: `PE ${pe.toFixed(2)}，缺少增长数据`, description: "当前 PE 很高，在缺少增长支撑数据时容错率较低。" };
}

export function deriveGrowthRequirementBadge(row: AssetUniverseView, fundamentals: AssetFundamentals | null | undefined): ValuationBadge {
  if (!isStock(row)) {
    return {
      label: "不适用",
      tone: "muted",
      reason: "增长兑现要求不适用于此类资产",
      description: "该标签主要用 PE 与 Yahoo 增长字段衡量个股当前估值对未来增长的要求。",
    };
  }

  const pe = fundamentals?.trailingPE ?? null;
  if (!Number.isFinite(pe) || Number(pe) <= 0) {
    return {
      label: "数据不足",
      tone: "muted",
      reason: "缺少 PE 数据",
      description: "缺少 PE，无法判断当前估值需要多强的增长兑现。",
    };
  }

  const growth = preferredGrowthMetric(fundamentals);
  if (!growth) return growthRequirementFromPeOnly(Number(pe));

  if (growth.value <= 0) {
    return {
      label: Number(pe) <= 18 ? "要求适中" : "要求极高",
      tone: Number(pe) <= 18 ? "fair" : "danger",
      reason: `PE ${Number(pe).toFixed(2)}，${growth.label} ${growth.value.toFixed(1)}%`,
      description: "Yahoo 当前增长字段未显示正增长，若业务不能重新提速，估值兑现压力会明显上升。",
    };
  }

  const coverage = Number(pe) / growth.value;
  const reason = `PE ${Number(pe).toFixed(2)}，Yahoo ${growth.label} ${growth.value.toFixed(1)}%`;
  if (coverage <= 0.8) {
    return { label: "要求较低", tone: "cheap", reason, description: `${reason}。以当前增长字段观察，估值对后续增长兑现要求不高。` };
  }
  if (coverage <= 1.5) {
    return { label: "要求适中", tone: "fair", reason, description: `${reason}。估值需要增长延续，但不属于特别激进的兑现要求。` };
  }
  if (coverage <= 2.5) {
    return { label: "要求较高", tone: "expensive", reason, description: `${reason}。当前估值需要较强增长继续兑现。` };
  }
  return { label: "要求极高", tone: "danger", reason, description: `${reason}。当前估值隐含的增长兑现压力很高。` };
}
