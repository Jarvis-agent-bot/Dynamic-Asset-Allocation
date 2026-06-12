"use client";

import { useMemo } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";

import {
  DaaSurfacePanel,
  DaaSurfaceStatusPill,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";

type AssetHealthRow = {
  assetKey: string;
  symbol: string;
  market: string;
  priceStatus: "fresh" | "stale" | "missing" | "unsupported";
  priceUpdatedAt: string | null;
  priceAgeSec: number | null;
};

type MarketHealth = {
  market: string;
  total: number;
  fresh: number;
  stale: number;
  missing: number;
  unsupported: number;
  oldestUpdateAt: string | null;
  healthPct: number;
};

type ExternalRequestLogItem = {
  id: string;
  provider: string;
  resource: string;
  subjectKey: string;
  endpointHost: string;
  httpStatus: number;
  errorCode: string;
  errorMessage: string;
  latencyMs: number;
  retryCount: number;
  cacheStatus: string;
  caller: string;
  createdAt: string;
};

type ExternalRequestSummaryItem = {
  provider: string;
  resource: string;
  endpointHost: string;
  totalCount: number;
  successCount: number;
  errorCount: number;
  rateLimitedCount: number;
  unauthorizedCount: number;
  latestAt: string | null;
  latestStatus: number;
  latestErrorCode: string;
};

type ExternalDataHealth = {
  sinceHours: number;
  items: ExternalRequestLogItem[];
  summary: ExternalRequestSummaryItem[];
};

type HealthTone = "success" | "warning" | "danger";

function formatPct(value: number): string {
  return `${Math.max(0, Math.min(100, value)).toFixed(0)}%`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "-";
  const timestamp = new Date(iso);
  if (!Number.isFinite(timestamp.getTime())) return "-";
  return timestamp.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function healthToneForPct(value: number): HealthTone {
  return value >= 90 ? "success" : value >= 70 ? "warning" : "danger";
}

function progressClassForTone(tone: HealthTone): string {
  if (tone === "success") {
    return "accent-[var(--success)] [&::-moz-progress-bar]:bg-[var(--success)] [&::-webkit-progress-value]:bg-[var(--success)]";
  }
  if (tone === "warning") {
    return "accent-[var(--amber)] [&::-moz-progress-bar]:bg-[var(--amber)] [&::-webkit-progress-value]:bg-[var(--amber)]";
  }
  return "accent-[var(--danger)] [&::-moz-progress-bar]:bg-[var(--danger)] [&::-webkit-progress-value]:bg-[var(--danger)]";
}

function MarketHealthCell({ marketSnapshot, index }: { marketSnapshot: MarketHealth; index: number }) {
  const tone = healthToneForPct(marketSnapshot.healthPct);
  const borderClass = [
    index % 2 === 0 ? "border-r border-[var(--border)]" : "",
    index < 2 ? "border-b border-[var(--border)]" : "",
    index % 4 === 3 ? "lg:border-r-0" : "lg:border-r lg:border-[var(--border)]",
    index >= 4 ? "lg:border-b-0" : "lg:border-b lg:border-[var(--border)]",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`min-w-0 bg-[var(--card)] px-3 py-2.5 ${borderClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-[var(--text)]">{marketSnapshot.market}</span>
        <span className="shrink-0 font-[var(--font-mono)] text-xs text-[var(--muted)]">{formatPct(marketSnapshot.healthPct)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-[var(--muted)]">
        <span>新鲜 {marketSnapshot.fresh}</span>
        <span>过期 {marketSnapshot.stale}</span>
        <span>缺失 {marketSnapshot.missing}</span>
        <span>共 {marketSnapshot.total}</span>
      </div>
      <progress
        aria-label={`${marketSnapshot.market} 数据健康度`}
        className={`mt-2 block h-1.5 w-full appearance-none overflow-hidden rounded-[var(--radius-sm)] bg-[var(--elevated)] [&::-webkit-progress-bar]:bg-[var(--elevated)] ${progressClassForTone(tone)}`}
        max={100}
        value={Math.max(0, Math.min(100, marketSnapshot.healthPct))}
      />
    </div>
  );
}

function ExternalRequestCell({
  label,
  value,
  tone = "neutral",
  index,
}: {
  label: string;
  value: string | number;
  tone?: "success" | "warning" | "danger" | "neutral";
  index: number;
}) {
  const toneClass = {
    success: "text-[var(--success)]",
    warning: "text-[var(--amber)]",
    danger: "text-[var(--danger)]",
    neutral: "text-[var(--text)]",
  }[tone];
  const borderClass = [
    index % 2 === 0 ? "border-r border-[var(--border)]" : "",
    index < 2 ? "border-b border-[var(--border)]" : "",
    index % 4 === 3 ? "lg:border-r-0" : "lg:border-r lg:border-[var(--border)]",
    "lg:border-b-0",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`min-w-0 bg-[var(--card)] px-3 py-2.5 ${borderClass}`}>
      <div className="truncate text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">{label}</div>
      <div className={`mt-1 font-[var(--font-mono)] text-[20px] leading-none ${toneClass}`}>{value}</div>
    </div>
  );
}

export function DataHealthPanel(props: { assets: AssetHealthRow[]; externalHealth?: ExternalDataHealth | null }) {
  const marketHealth = useMemo(() => {
    const groups = new Map<string, AssetHealthRow[]>();
    for (const assetRow of props.assets) {
      const marketKey = assetRow.market || "OTHER";
      if (!groups.has(marketKey)) groups.set(marketKey, []);
      groups.get(marketKey)!.push(assetRow);
    }

    const result: MarketHealth[] = [];
    for (const [market, assets] of groups) {
      const fresh = assets.filter((assetRow) => assetRow.priceStatus === "fresh").length;
      const stale = assets.filter((assetRow) => assetRow.priceStatus === "stale").length;
      const missing = assets.filter((assetRow) => assetRow.priceStatus === "missing").length;
      const unsupported = assets.filter((assetRow) => assetRow.priceStatus === "unsupported").length;
      const updates = assets
        .map((assetRow) => assetRow.priceUpdatedAt)
        .filter(Boolean)
        .sort();
      result.push({
        market,
        total: assets.length,
        fresh,
        stale,
        missing,
        unsupported,
        oldestUpdateAt: updates[0] ?? null,
        healthPct: assets.length > 0 ? (fresh / assets.length) * 100 : 0,
      });
    }

    return result.sort((leftMarket, rightMarket) => leftMarket.market.localeCompare(rightMarket.market));
  }, [props.assets]);

  const overallHealth = useMemo(() => {
    const total = props.assets.length;
    const fresh = props.assets.filter((assetRow) => assetRow.priceStatus === "fresh").length;
    return total > 0 ? (fresh / total) * 100 : 0;
  }, [props.assets]);

  const staleAssets = useMemo(
    () => props.assets.filter((assetRow) => assetRow.priceStatus === "stale" || assetRow.priceStatus === "missing"),
    [props.assets],
  );

  const healthTone = overallHealth >= 90 ? "success" : overallHealth >= 70 ? "warning" : "danger";
  const HealthIcon = overallHealth >= 90 ? CheckCircle2 : overallHealth >= 70 ? AlertTriangle : XCircle;
  const externalSummary = props.externalHealth?.summary ?? [];
  const externalItems = props.externalHealth?.items ?? [];
  const externalTotals = useMemo(() => {
    const total = externalSummary.reduce((sum, item) => sum + item.totalCount, 0);
    const success = externalSummary.reduce((sum, item) => sum + item.successCount, 0);
    const errors = externalSummary.reduce((sum, item) => sum + item.errorCount, 0);
    const rateLimited = externalSummary.reduce((sum, item) => sum + item.rateLimitedCount, 0);
    const unauthorized = externalSummary.reduce((sum, item) => sum + item.unauthorizedCount, 0);
    return {
      total,
      success,
      errors,
      rateLimited,
      unauthorized,
      successRate: total > 0 ? (success / total) * 100 : 100,
    };
  }, [externalSummary]);
  const externalErrors = useMemo(
    () => externalItems.filter((item) => item.httpStatus === 0 || item.httpStatus >= 400 || item.errorCode).slice(0, 8),
    [externalItems],
  );
  const externalTone = externalTotals.rateLimited > 0 || externalTotals.unauthorized > 0 || externalTotals.successRate < 80
    ? "warning"
    : "success";

  return (
    <DaaSurfacePanel
      accent={healthTone}
      title="数据质量监控"
      subtitle={`${props.assets.length} 个标的 · 整体健康度 ${overallHealth.toFixed(0)}%`}
      action={
        <DaaSurfaceStatusPill tone={healthTone}>
          <HealthIcon className="mr-1 inline h-3 w-3" />
          {overallHealth >= 90 ? "健康" : overallHealth >= 70 ? "部分降级" : "数据异常"}
        </DaaSurfaceStatusPill>
      }
    >
      <div className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] lg:grid-cols-4">
        {marketHealth.map((marketSnapshot, index) => (
          <MarketHealthCell key={marketSnapshot.market} marketSnapshot={marketSnapshot} index={index} />
        ))}
      </div>

      {/* 过期/缺失标的列表 */}
      {staleAssets.length > 0 && (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--amber-border)] bg-[var(--amber-bg)] px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--amber)]">
            <Clock className="h-3.5 w-3.5" />
            需要关注的标的 ({staleAssets.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {staleAssets.slice(0, 20).map((assetRow) => (
              <span
                key={assetRow.assetKey}
                className={`rounded-[var(--radius-sm)] px-2 py-0.5 text-[10px] font-medium ${
                  assetRow.priceStatus === "missing"
                    ? "bg-[var(--danger-bg)] text-[var(--danger)]"
                    : "bg-[var(--amber-bg)] text-[var(--amber)]"
                }`}
              >
                {assetRow.symbol} ({assetRow.priceStatus === "missing" ? "缺失" : "过期"})
              </span>
            ))}
            {staleAssets.length > 20 && (
              <span className="text-[10px] text-[var(--faint)]">
                ...还有 {staleAssets.length - 20} 个
              </span>
            )}
          </div>
        </div>
      )}

      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <Activity className="h-4 w-4 text-[var(--primary)]" />
              外部数据源健康
            </div>
            <div className="mt-1 text-xs text-[var(--muted)]">
              最近 {props.externalHealth?.sinceHours ?? 24} 小时 · {externalTotals.total} 次外部请求
            </div>
          </div>
          <DaaSurfaceStatusPill tone={externalTone}>
            {externalTotals.total <= 0
              ? "暂无请求记录"
              : `成功率 ${formatPct(externalTotals.successRate)}`}
          </DaaSurfaceStatusPill>
        </div>

        <div className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] lg:grid-cols-4">
          <ExternalRequestCell label="成功 / 总请求" value={`${externalTotals.success}/${externalTotals.total}`} tone="success" index={0} />
          <ExternalRequestCell label="错误请求" value={externalTotals.errors} tone={externalTotals.errors > 0 ? "warning" : "neutral"} index={1} />
          <ExternalRequestCell label="429 限速" value={externalTotals.rateLimited} tone={externalTotals.rateLimited > 0 ? "warning" : "neutral"} index={2} />
          <ExternalRequestCell label="401/403/crumb" value={externalTotals.unauthorized} tone={externalTotals.unauthorized > 0 ? "danger" : "neutral"} index={3} />
        </div>

        {externalSummary.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)]">
            <div className="grid grid-cols-[1.4fr_0.9fr_0.8fr_0.8fr] gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[11px] font-semibold uppercase text-[var(--faint)]">
              <span>数据源 / 资源</span>
              <span>Host</span>
              <span>成功率</span>
              <span>最新状态</span>
            </div>
            {externalSummary.slice(0, 8).map((item) => {
              const rate = item.totalCount > 0 ? (item.successCount / item.totalCount) * 100 : 100;
              return (
                <div
                  key={`${item.provider}:${item.resource}:${item.endpointHost}`}
                  className="grid grid-cols-[1.4fr_0.9fr_0.8fr_0.8fr] gap-2 border-b border-[var(--border)] px-3 py-2 text-xs last:border-b-0"
                >
                  <span className="min-w-0 truncate font-medium text-[var(--text)]">{item.provider} · {item.resource}</span>
                  <span className="min-w-0 truncate text-[var(--muted)]">{item.endpointHost || "-"}</span>
                  <span className={rate >= 90 ? "text-[var(--success)]" : "text-[var(--amber)]"}>
                    {formatPct(rate)} ({item.successCount}/{item.totalCount})
                  </span>
                  <span className="min-w-0 truncate text-[var(--muted)]">
                    {item.latestStatus || "-"} · {formatWhen(item.latestAt)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-3 rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] px-3 py-3 text-sm text-[var(--muted)]">
            还没有外部请求记录。下一次刷新行情、宏观指标、新闻或基金持仓后，这里会显示外部数据源状态。
          </div>
        )}

        {externalErrors.length > 0 ? (
          <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--amber-border)] bg-[var(--amber-bg)] px-3 py-2.5">
            <div className="mb-2 text-xs font-semibold text-[var(--amber)]">最近错误</div>
            <div className="space-y-1.5">
              {externalErrors.map((item) => (
                <div key={item.id} className="flex flex-col gap-0.5 text-xs sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0 truncate text-[var(--text)]">
                    {item.provider} · {item.resource} · {item.subjectKey || "-"}
                  </span>
                  <span className="text-[var(--muted)]">
                    {item.httpStatus || "network"} {item.errorCode || "error"} · {formatWhen(item.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </DaaSurfacePanel>
  );
}
