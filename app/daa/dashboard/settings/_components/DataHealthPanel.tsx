"use client";

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";

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

export function DataHealthPanel(props: { assets: AssetHealthRow[] }) {
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
    </DaaSurfacePanel>
  );
}
