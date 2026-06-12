"use client";

/**
 * 持仓/目标/漂移面板。
 * 集中展示资产的权重状态：当前权重、目标权重、漂移值、漂移方向。
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Target, TrendingUp, TrendingDown } from "lucide-react";

import { formatCurrency, formatDateTime } from "@/app/daa/dashboard/_components/daaFormatters";
import { cn } from "@/lib/utils";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";
import type { TargetWeightAuditRecord } from "@/src/daa/store/targetWeightAuditStore";

function priceStatusMeta(status: AssetUniverseView["priceStatus"]) {
  if (status === "fresh") return {
    label: "实时",
    className: "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]",
  };
  if (status === "stale") return {
    label: "延迟",
    className: "border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber)]",
  };
  if (status === "missing") return {
    label: "缺失",
    className: "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]",
  };
  if (status === "unsupported") return {
    label: "不支持",
    className: "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]",
  };
  return {
    label: "未知",
    className: "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]",
  };
}

function formatPriceAge(seconds: number | null | undefined): string {
  if (seconds == null) return "--";
  if (seconds < 90) return `${Math.max(0, Math.round(seconds))}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(seconds < 36_000 ? 1 : 0)}h`;
}

function formatTargetPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return `${value.toFixed(2)}%`;
}

function targetAuditSourceLabel(source: TargetWeightAuditRecord["source"]): string {
  return {
    manual_asset_patch: "手动",
    asset_upsert: "资产新增",
    agent_target_weight_pool: "目标建议",
    rebalance_execution: "成交同步",
    target_allocation_apply: "批量应用",
    portfolio_template_apply: "模板",
    strategy_lab_apply: "策略测试台",
    candidate_assets_replace: "候选替换",
    system: "系统",
  }[source] || "系统";
}

export function AssetPositionPanel({
  row,
  baseCurrency = "USD",
  targetWeightAudits = [],
  onUpdateTargetWeight,
  updating = false,
}: {
  row: AssetUniverseView;
  baseCurrency?: string;
  targetWeightAudits?: TargetWeightAuditRecord[];
  onUpdateTargetWeight?: (targetWeightPct: number) => Promise<void> | void;
  updating?: boolean;
}) {
  const actualPct = row.actualWeightPct ?? 0;
  const targetPct = row.targetWeightPct ?? (row.targetWeightHint ?? 0) * 100;
  const gap = row.gapPct ?? (targetPct - actualPct);
  const hasTarget = targetPct > 0;
  const displayGap = -gap;

  // 漂移状态
  const absGap = Math.abs(gap);
  const gapState = absGap < 0.05 ? "onTarget"
    : absGap < 2 ? "slight"
    : absGap < 5 ? "moderate"
    : "significant";

  const gapColor = {
    onTarget: "text-[var(--success)]",
    slight: "text-[var(--muted)]",
    moderate: "text-[var(--amber)]",
    significant: "text-[var(--danger)]",
  }[gapState];

  const gapLabel = {
    onTarget: "接近目标",
    slight: "轻微偏离",
    moderate: "中度偏离",
    significant: "显著偏离",
  }[gapState];
  const gapDirectionLabel = displayGap > 0 ? "高于目标" : displayGap < 0 ? "低于目标" : "贴近目标";
  const [draft, setDraft] = useState(() => targetPct.toFixed(2));
  const parsedDraft = Number(draft);
  const validDraft = Number.isFinite(parsedDraft) && parsedDraft >= 0 && parsedDraft <= 100;
  const dirty = validDraft && Math.abs(parsedDraft - targetPct) >= 0.005;
  const priceStatus = priceStatusMeta(row.priceStatus);
  const targetZeroWithHolding = targetPct <= 0.005 && actualPct > 0.005;

  useEffect(() => {
    setDraft(targetPct.toFixed(2));
  }, [row.assetKey, targetPct]);

  const quickTargets = useMemo(() => {
    const base = [0, 2, 5, 10];
    if (targetPct > 10) base.push(Number(targetPct.toFixed(2)));
    return [...new Set(base)].sort((leftTargetPct, rightTargetPct) => leftTargetPct - rightTargetPct);
  }, [targetPct]);

  async function handleSubmit() {
    if (!onUpdateTargetWeight || !validDraft || updating) return;
    await onUpdateTargetWeight(parsedDraft);
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
        <Target className="h-4 w-4 text-[var(--primary)]" />
        <h3 className="text-sm font-semibold text-[var(--text)]">持仓与目标</h3>
      </div>

      <div className="space-y-3 p-3">
        {/* 权重对比条 */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="text-[var(--muted)]">当前权重</span>
            <span className="font-[var(--font-mono)] text-sm font-semibold text-[var(--text)]">
              {actualPct.toFixed(2)}%
            </span>
          </div>
          <progress
            aria-label="当前持仓权重"
            className="block h-2 w-full appearance-none overflow-hidden rounded-[var(--radius-sm)] bg-[var(--elevated)] accent-[var(--primary)] [&::-moz-progress-bar]:bg-[var(--primary)] [&::-webkit-progress-bar]:bg-[var(--elevated)] [&::-webkit-progress-value]:bg-[var(--primary)]"
            max={100}
            value={Math.min(100, Math.max(0, actualPct))}
          />
          <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--faint)]">
            <span>目标 {targetPct.toFixed(2)}%</span>
            <span className={cn("flex items-center gap-1 font-medium", gapColor)}>
              {displayGap > 0.05 ? <TrendingUp className="h-3 w-3" /> : displayGap < -0.05 ? <TrendingDown className="h-3 w-3" /> : null}
              {gapLabel} · {gapDirectionLabel} {Math.abs(displayGap).toFixed(2)}%
            </span>
          </div>
        </div>

        <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] sm:grid-cols-2">
          <div className="min-w-0 border-b border-[var(--border)] px-2.5 py-2 sm:border-r">
            <div className="text-[10px] text-[var(--muted)]">市值</div>
            <div className="mt-1 truncate font-[var(--font-mono)] text-xs font-semibold text-[var(--text)]">
              {formatCurrency(row.valuationBase ?? 0, baseCurrency)}
            </div>
          </div>
          <div className="min-w-0 border-b border-[var(--border)] px-2.5 py-2">
            <div className="text-[10px] text-[var(--muted)]">最新价</div>
            <div className="mt-1 truncate font-[var(--font-mono)] text-xs font-semibold text-[var(--text)]">
              {formatCurrency(row.lastPrice, row.currency)}
            </div>
          </div>
          <div className="min-w-0 border-b border-[var(--border)] px-2.5 py-2 sm:border-b-0 sm:border-r">
            <div className="text-[10px] text-[var(--muted)]">更新时间</div>
            <div className="mt-1 truncate font-[var(--font-mono)] text-xs font-semibold text-[var(--text)]">
              {formatDateTime(row.priceUpdatedAt)}
            </div>
          </div>
          <div className="min-w-0 px-2.5 py-2">
            <div className="text-[10px] text-[var(--muted)]">价格状态</div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className={cn("inline-flex rounded-[var(--radius-sm)] border px-1.5 py-0.5 font-[var(--font-mono)] text-[10px] font-semibold", priceStatus.className)}>
                {priceStatus.label}
              </span>
              <span className="font-[var(--font-mono)] text-[10px] text-[var(--faint)]">{formatPriceAge(row.priceAgeSec)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[11px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--muted)]">数据源</span>
            <span className="truncate text-right font-[var(--font-mono)] text-[var(--text)]">{row.priceSource || "--"}</span>
          </div>
        </div>

        {targetZeroWithHolding ? (
          <div className="rounded-[var(--radius-sm)] border border-[var(--amber-border)] bg-[var(--amber-bg)] px-3 py-2 text-[11px] leading-5 text-[var(--amber)]">
            当前仍有持仓，但目标权重为 0。复核时优先确认是否减仓；若要保留，请手动设置目标权重。
          </div>
        ) : !hasTarget ? (
          <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[11px] text-[var(--muted)]">
            尚未设置目标权重。保存后纳入调仓偏离复核。
          </div>
        ) : null}

        {onUpdateTargetWeight ? (
          <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-[var(--text)]">手动目标权重</div>
                <div className="mt-0.5 text-[11px] leading-4 text-[var(--muted)]">
                  直接覆盖该资产目标权重，并写入下次复核依据。
                </div>
              </div>
              <span className="font-[var(--font-mono)] text-[11px] text-[var(--faint)]">0-100%</span>
            </div>
            <div className="flex gap-2">
              <div className="flex h-10 min-w-0 flex-1 items-center rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--card)] px-3 focus-within:border-[var(--primary)] focus-within:ring-2 focus-within:ring-[var(--primary-bg)]">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleSubmit();
                  }}
                  className="min-w-0 flex-1 bg-transparent font-[var(--font-mono)] text-sm text-[var(--text)] outline-none"
                  aria-label="手动目标权重"
                />
                <span className="ml-2 text-xs text-[var(--muted)]">%</span>
              </div>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!dirty || updating}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] border px-3 text-xs font-semibold transition-colors",
                  dirty && !updating
                    ? "border-[var(--primary-border)] bg-[var(--primary)] text-white hover:opacity-90"
                    : "cursor-not-allowed border-[var(--border)] bg-[var(--elevated)] text-[var(--faint)]",
                )}
              >
                {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                保存
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {quickTargets.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDraft(value.toFixed(2))}
                  className="h-7 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--card)] px-2 font-[var(--font-mono)] text-[11px] text-[var(--muted)] transition-colors hover:border-[var(--primary-border)] hover:text-[var(--primary)]"
                >
                  {value.toFixed(value % 1 === 0 ? 0 : 2)}%
                </button>
              ))}
            </div>
            {!validDraft ? (
              <div className="mt-2 text-[11px] text-[var(--danger)]">请输入 0 到 100 之间的百分比。</div>
            ) : null}
          </div>
        ) : null}

        <div className="border-t border-[var(--border)] pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-[var(--text)]">目标权重记录</div>
            <div className="font-[var(--font-mono)] text-[10px] text-[var(--faint)]">
              {targetWeightAudits.length > 0 ? `${targetWeightAudits.length} 条` : "暂无"}
            </div>
          </div>
          {targetWeightAudits.length > 0 ? (
            <div className="divide-y divide-[var(--border)]">
              {targetWeightAudits.slice(0, 5).map((audit) => (
                <div key={audit.id} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                      {targetAuditSourceLabel(audit.source)}
                    </span>
                    <span className="font-[var(--font-mono)] text-[10px] text-[var(--faint)]">
                      {formatDateTime(audit.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 font-[var(--font-mono)] text-xs font-semibold text-[var(--text)]">
                    {formatTargetPct(audit.previousTargetWeightPct)} → {formatTargetPct(audit.nextTargetWeightPct)}
                  </div>
                  {audit.reason ? (
                    <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--muted)]">
                      {audit.reason}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[11px] leading-5 text-[var(--muted)]">
              暂无目标权重记录。之后手动、目标建议、策略测试台或模板调整时，会在这里形成复核线索。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
