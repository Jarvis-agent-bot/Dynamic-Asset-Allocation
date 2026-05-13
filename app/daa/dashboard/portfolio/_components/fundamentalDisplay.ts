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

function byAbsoluteFallback(input: { metricLabel: string; value: number; cheap: number; fair: number; expensive: number }): ValuationBadge {
  const reason = `${input.metricLabel} ${input.value.toFixed(2)}，历史样本不足`;
  if (input.value <= input.cheap) {
    return { label: "偏便宜", tone: "cheap", reason, description: `${reason}；暂时用绝对阈值辅助判断，后续拿到更多历史样本后会切换为历史分位。` };
  }
  if (input.value <= input.fair) {
    return { label: "合理", tone: "fair", reason, description: `${reason}；暂时用绝对阈值辅助判断。` };
  }
  if (input.value <= input.expensive) {
    return { label: "偏贵", tone: "expensive", reason, description: `${reason}；暂时用绝对阈值辅助判断。` };
  }
  return { label: "昂贵", tone: "danger", reason, description: `${reason}；暂时用绝对阈值辅助判断。` };
}

export function deriveValuationBadge(row: AssetUniverseView, fundamentals: AssetFundamentals | null | undefined): ValuationBadge {
  if (!isStock(row)) {
    return {
      label: "不适用",
      tone: "muted",
      reason: "PE / PEG 不适用于此类资产",
      description: "PE / PEG 主要适合个股，ETF、债券、商品和加密资产需要看不同指标。",
    };
  }

  const peg = fundamentals?.pegRatio ?? null;
  if (Number.isFinite(peg) && Number(peg) > 0) {
    const percentile = fundamentals?.pegPercentile ?? null;
    const sampleCount = fundamentals?.pegSampleCount ?? 0;
    if (Number.isFinite(percentile) && sampleCount >= 3) {
      return byHistoricalPercentile({
        metricLabel: "PEG",
        value: Number(peg),
        percentile: Number(percentile),
        sampleCount,
      });
    }
    return byAbsoluteFallback({ metricLabel: "PEG", value: Number(peg), cheap: 1, fair: 1.5, expensive: 2.5 });
  }

  const pe = fundamentals?.trailingPE ?? null;
  if (Number.isFinite(pe) && Number(pe) > 0) {
    const percentile = fundamentals?.pePercentile ?? null;
    const sampleCount = fundamentals?.peSampleCount ?? 0;
    if (Number.isFinite(percentile) && sampleCount >= 3) {
      return byHistoricalPercentile({
        metricLabel: "PE(TTM)",
        value: Number(pe),
        percentile: Number(percentile),
        sampleCount,
      });
    }
    return byAbsoluteFallback({ metricLabel: "PE(TTM)", value: Number(pe), cheap: 15, fair: 30, expensive: 45 });
  }

  return {
    label: "数据不足",
    tone: "muted",
    reason: "暂未拿到 PE / PEG 数据",
    description: "暂未拿到可用的 PE / PEG 数据。",
  };
}
