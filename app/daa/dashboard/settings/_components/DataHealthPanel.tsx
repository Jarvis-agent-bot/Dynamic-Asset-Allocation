"use client";

import { useMemo } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock, ShieldAlert, XCircle } from "lucide-react";

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

function formatPct(value: number): string {
  return `${Math.max(0, Math.min(100, value)).toFixed(0)}%`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "-";
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DataHealthPanel(props: { assets: AssetHealthRow[]; externalHealth?: ExternalDataHealth | null }) {
  const marketHealth = useMemo(() => {
    const groups = new Map<string, AssetHealthRow[]>();
    for (const a of props.assets) {
      const m = a.market || "OTHER";
      if (!groups.has(m)) groups.set(m, []);
      groups.get(m)!.push(a);
    }

    const result: MarketHealth[] = [];
    for (const [market, assets] of groups) {
      const fresh = assets.filter((a) => a.priceStatus === "fresh").length;
      const stale = assets.filter((a) => a.priceStatus === "stale").length;
      const missing = assets.filter((a) => a.priceStatus === "missing").length;
      const unsupported = assets.filter((a) => a.priceStatus === "unsupported").length;
      const updates = assets
        .map((a) => a.priceUpdatedAt)
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

    return result.sort((a, b) => a.market.localeCompare(b.market));
  }, [props.assets]);

  const overallHealth = useMemo(() => {
    const total = props.assets.length;
    const fresh = props.assets.filter((a) => a.priceStatus === "fresh").length;
    return total > 0 ? (fresh / total) * 100 : 0;
  }, [props.assets]);

  const staleAssets = useMemo(
    () => props.assets.filter((a) => a.priceStatus === "stale" || a.priceStatus === "missing"),
    [props.assets],
  );

  const healthTone = overallHealth >= 90 ? "green" : overallHealth >= 70 ? "amber" : "red";
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
    ? "amber"
    : "green";

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
      {/* 按市场分组统计 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {marketHealth.map((m) => (
          <div
            key={m.market}
            className="rounded-[12px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] px-3 py-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--text)]">{m.market}</span>
              <span className="text-xs text-[var(--muted)]">{m.total} 个标的</span>
            </div>
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  新鲜
                </span>
                <span className="text-[var(--text)]">{m.fresh}</span>
              </div>
              {m.stale > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-amber-400">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                    过期
                  </span>
                  <span className="text-[var(--text)]">{m.stale}</span>
                </div>
              )}
              {m.missing > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-red-400">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
                    缺失
                  </span>
                  <span className="text-[var(--text)]">{m.missing}</span>
                </div>
              )}
            </div>
            {/* 健康度进度条 */}
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${m.healthPct}%`,
                    backgroundColor:
                      m.healthPct >= 90
                        ? "hsl(142 71% 45%)"
                        : m.healthPct >= 70
                          ? "hsl(45 93% 55%)"
                          : "hsl(0 84% 60%)",
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 过期/缺失标的列表 */}
      {staleAssets.length > 0 && (
        <div className="mt-4 rounded-[12px] border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-400">
            <Clock className="h-3.5 w-3.5" />
            需要关注的标的 ({staleAssets.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {staleAssets.slice(0, 20).map((a) => (
              <span
                key={a.assetKey}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  a.priceStatus === "missing"
                    ? "bg-red-500/10 text-red-400"
                    : "bg-amber-500/10 text-amber-400"
                }`}
              >
                {a.symbol} ({a.priceStatus === "missing" ? "缺失" : "过期"})
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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[8px] border border-[var(--border)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
            <div className="text-xs text-[var(--muted)]">成功 / 总请求</div>
            <div className="mt-1 text-lg font-semibold text-[var(--text)]">{externalTotals.success}/{externalTotals.total}</div>
          </div>
          <div className="rounded-[8px] border border-[var(--border)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
            <div className="text-xs text-[var(--muted)]">错误请求</div>
            <div className="mt-1 text-lg font-semibold text-[var(--text)]">{externalTotals.errors}</div>
          </div>
          <div className="rounded-[8px] border border-[var(--border)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
            <div className="text-xs text-[var(--muted)]">429 限速</div>
            <div className="mt-1 text-lg font-semibold text-amber-300">{externalTotals.rateLimited}</div>
          </div>
          <div className="rounded-[8px] border border-[var(--border)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
            <div className="text-xs text-[var(--muted)]">401/403/crumb</div>
            <div className="mt-1 flex items-center gap-1.5 text-lg font-semibold text-[var(--text)]">
              <ShieldAlert className="h-4 w-4 text-[var(--faint)]" />
              {externalTotals.unauthorized}
            </div>
          </div>
        </div>

        {externalSummary.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-[8px] border border-[var(--border)]">
            <div className="grid grid-cols-[1.4fr_0.9fr_0.8fr_0.8fr] gap-2 border-b border-[var(--border)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-[11px] font-semibold uppercase text-[var(--faint)]">
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
                  <span className={rate >= 90 ? "text-emerald-300" : "text-amber-300"}>
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
          <div className="mt-3 rounded-[8px] border border-dashed border-[var(--border)] px-3 py-3 text-sm text-[var(--muted)]">
            还没有外部请求记录。下一次刷新行情或基础面数据后，这里会显示 Yahoo 请求状态、限速与 crumb 错误。
          </div>
        )}

        {externalErrors.length > 0 ? (
          <div className="mt-3 rounded-[8px] border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
            <div className="mb-2 text-xs font-semibold text-amber-300">最近错误</div>
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
