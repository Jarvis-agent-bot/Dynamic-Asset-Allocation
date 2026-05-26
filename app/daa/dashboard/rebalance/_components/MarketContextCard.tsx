"use client";

import { DaaSurfaceStatusPill, type DaaSurfaceTone } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { marketRegimeLabel, marketRegimeTone } from "@/app/daa/dashboard/_shared/rebalance/rebalanceLabels";
import {
  isActionableMarketScope,
  marketPressureLabelZh,
  marketRegimeEnvironmentLabelZh,
  marketScopeMeaningZh,
  marketScopeMetricLabelZh,
  marketScopePrimaryLabelZh,
} from "@/src/daa/modules/marketContext/marketContextLabels";
import type {
  DaaAssetBudgetOverlayKey,
  DaaMarketContext,
} from "@/src/daa/modules/marketContext/marketContextTypes";

function riskScoreTone(scorePct: number | null | undefined): DaaSurfaceTone {
  const score = Number.isFinite(scorePct) ? Number(scorePct) : 50;
  if (score >= 80) return "red";
  if (score >= 65) return "amber";
  if (score <= 35) return "green";
  return "slate";
}

function formatPct(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return "-";
  return `${Number(value).toFixed(0)}%`;
}

function assetBudgetStanceLabel(stance: string): string {
  if (stance === "increase") return "提高预算";
  if (stance === "reduce") return "降低预算";
  return "维持中性";
}

function asAssetBudgetKey(scope: string): DaaAssetBudgetOverlayKey | null {
  if (
    scope === "us_equity"
    || scope === "hk_cn_equity"
    || scope === "crypto"
    || scope === "duration_bonds"
    || scope === "short_bonds_cash"
    || scope === "gold_commodities"
  ) {
    return scope;
  }
  return null;
}

type AiSnapshot = {
  summary?: string;
  reasoning?: string;
  keyRisks?: string[];
  keyOpportunities?: string[];
  cashAdvice?: string;
  cashRationale?: string;
  overallConfidence?: number;
} | null;

export function MarketContextCard(props: {
  marketContext: DaaMarketContext | null;
  aiSnapshot?: AiSnapshot;
}) {
  const mc = props.marketContext;

  if (!mc) {
    return (
      <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)] px-4 py-3 text-center text-xs text-[var(--muted)]">
        市场环境数据暂不可用
      </div>
    );
  }

  const vix = mc.indicators.find((i) => i.key === "vix");
  const confidence = props.aiSnapshot?.overallConfidence ?? mc.confidencePct;
  const actionableScopes = mc.scopes.filter((s) => isActionableMarketScope(s.scope));
  const macroScopes = mc.scopes.filter((s) => !isActionableMarketScope(s.scope) && s.scope !== "macro_policy");
  const macroPolicy = mc.macroPolicy ?? null;
  const assetBudgets = (mc.assetBudgets || []).slice(0, 4);
  const assetBudgetByScope = new Map((mc.assetBudgets || []).map((budget) => [budget.key, budget] as const));
  const topReason = props.aiSnapshot?.summary || mc.reasons[0] || "市场指标已更新，可结合左侧调仓建议一起审阅。";

  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">
            市场环境
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <DaaSurfaceStatusPill tone={marketRegimeTone(mc.regime)}>
              {marketRegimeLabel(mc.regime)}
            </DaaSurfaceStatusPill>
            <span className="text-xs text-[var(--muted)]">{marketRegimeEnvironmentLabelZh(mc.regime)}</span>
          </div>
        </div>
        {vix ? (
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">VIX</div>
            <div className="font-[var(--font-mono)] text-sm font-semibold text-[var(--text)]">
              {(vix.rawValue ?? 0).toFixed(1)}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-3 rounded-[12px] border border-[rgba(255,255,255,0.06)] bg-[rgba(8,12,20,0.62)] px-3 py-2.5 text-xs leading-5 text-[var(--muted)]">
        这不是直接下单指令；它只说明当前市场是否适合加仓。真正买入或卖出哪只资产，以左侧“本次建议”的订单方向和金额为准。
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-[12px] border border-[var(--border)] bg-[rgba(8,12,20,0.5)] px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">风险压力</div>
          <div className="mt-1 flex items-center gap-2">
            <DaaSurfaceStatusPill tone={riskScoreTone(mc.riskOffScorePct)}>
              {marketPressureLabelZh(mc.riskOffScorePct)}
            </DaaSurfaceStatusPill>
            <span className="font-[var(--font-mono)] text-sm text-[var(--text)]">{mc.riskOffScorePct.toFixed(0)}/100</span>
          </div>
        </div>
        <div className="rounded-[12px] border border-[var(--border)] bg-[rgba(8,12,20,0.5)] px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">判断置信度</div>
          <div className="mt-1 font-[var(--font-mono)] text-sm font-semibold text-[var(--text)]">
            {confidence == null ? "-" : formatPct(confidence)}
          </div>
        </div>
      </div>

      <div className="mt-3 text-xs leading-5 text-[var(--muted)]">{topReason}</div>

      {macroPolicy ? (
        <div className="mt-4 rounded-[12px] border border-[var(--border)] bg-[rgba(8,12,20,0.5)] px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-[var(--text)]">宏观政策</span>
            <DaaSurfaceStatusPill tone={riskScoreTone(macroPolicy.pressurePct)}>
              {macroPolicy.label}
            </DaaSurfaceStatusPill>
          </div>
          <div className="mt-1 text-xs text-[var(--faint)]">
            政策压力 {macroPolicy.pressurePct.toFixed(0)}/100 · 置信度 {macroPolicy.confidencePct.toFixed(0)}%
          </div>
          {macroPolicy.reasons[0] ? (
            <div className="mt-2 text-xs leading-5 text-[var(--muted)]">{macroPolicy.reasons[0]}</div>
          ) : null}
          <div className="mt-2 grid gap-1.5">
            {macroPolicy.dimensions.map((dimension) => (
              <div key={dimension.key} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-[var(--muted)]">{dimension.label}</span>
                <span className="font-[var(--font-mono)] text-[var(--text)]">{dimension.pressurePct.toFixed(0)}/100</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {assetBudgets.length > 0 ? (
        <div className="mt-4 space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">资产预算倾斜</div>
          {assetBudgets.map((budget) => (
            <div key={budget.key} className="rounded-[12px] border border-[var(--border)] bg-[rgba(8,12,20,0.44)] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--text)]">{budget.label}</span>
                <DaaSurfaceStatusPill tone={riskScoreTone(budget.pressurePct)}>
                  {assetBudgetStanceLabel(budget.stance)}
                </DaaSurfaceStatusPill>
              </div>
              <div className="mt-1 text-xs text-[var(--faint)]">
                预算系数 {Math.round(budget.budgetScale * 100)}% · 压力 {budget.pressurePct.toFixed(0)}/100
              </div>
              {budget.reasons[0] ? (
                <div className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{budget.reasons[0]}</div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {actionableScopes.length > 0 ? (
        <div className="mt-4 space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">各市场状态</div>
          {actionableScopes.map((s) => (
            <div key={s.scope} className="rounded-[12px] border border-[var(--border)] bg-[rgba(8,12,20,0.48)] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--text)]">{s.label}</span>
                <DaaSurfaceStatusPill tone={riskScoreTone(s.riskOffScorePct)}>
                  {marketScopePrimaryLabelZh(s)}
                </DaaSurfaceStatusPill>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-[var(--faint)]">
                <span>
                  {(() => {
                    const budgetKey = asAssetBudgetKey(s.scope);
                    const budget = budgetKey ? assetBudgetByScope.get(budgetKey) : null;
                    return budget ? `资产预算 ${Math.round(budget.budgetScale * 100)}%` : `压力 ${Math.round(s.riskOffScorePct)}/100`;
                  })()}
                </span>
                <span>压力 {Math.round(s.riskOffScorePct)}/100</span>
              </div>
              <div className="mt-1 text-xs leading-5 text-[var(--muted)]">{marketScopeMeaningZh(s.scope)}</div>
            </div>
          ))}
        </div>
      ) : null}

      {macroScopes.length > 0 ? (
        <div className="mt-4 space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">宏观背景</div>
          <div className="grid gap-2">
            {macroScopes.map((s) => (
              <div key={s.scope} className="rounded-[12px] border border-[var(--border)] bg-[rgba(8,12,20,0.36)] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--text)]">{s.label}</span>
                  <DaaSurfaceStatusPill tone={riskScoreTone(s.riskOffScorePct)}>
                    {marketScopePrimaryLabelZh(s)}
                  </DaaSurfaceStatusPill>
                </div>
                <div className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  {marketScopeMetricLabelZh(s.scope)} {Math.round(s.riskOffScorePct)}/100 · {marketScopeMeaningZh(s.scope)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
