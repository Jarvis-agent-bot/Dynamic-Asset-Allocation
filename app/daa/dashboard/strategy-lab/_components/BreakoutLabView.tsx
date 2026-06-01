"use client";

import { useMemo, useState } from "react";
import { Play } from "lucide-react";

import {
  DaaSurfaceMetricCard,
  DaaSurfacePanel,
  DaaSurfaceActionButton,
  DaaSurfaceEmptyState,
  daaSurfaceFieldClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { DashboardErrorNotice } from "@/app/daa/dashboard/_components/DashboardFeedback";
import { useBreakoutLab, type BreakoutConfigState } from "./useBreakoutLab";
import type { StrategyLabDateDefaults } from "./strategyLabDateDefaults";
import type { StrategyLabInitialData } from "./strategyLabInitialData";

type DatePreset = {
  label: string;
  resolveStartDate: (endDate: Date) => Date;
};

const DATE_PRESETS: DatePreset[] = [
  { label: "近 6 月", resolveStartDate: (endDate) => shiftMonths(endDate, -6) },
  { label: "近 1 年", resolveStartDate: (endDate) => shiftYears(endDate, -1) },
  { label: "近 3 年", resolveStartDate: (endDate) => shiftYears(endDate, -3) },
  { label: "近 5 年", resolveStartDate: (endDate) => shiftYears(endDate, -5) },
  { label: "今年以来", resolveStartDate: (endDate) => new Date(endDate.getFullYear(), 0, 1) },
];

function parseDateInput(value: string): Date {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function shiftYears(date: Date, years: number): Date {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  suffix?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
      <span>{label}{suffix ? <span className="text-[var(--muted)]">（{suffix}）</span> : null}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        className={daaSurfaceFieldClassName}
      />
    </label>
  );
}

function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function pctAbs(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.abs(n).toFixed(1)}%`;
}

function r2(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;
}

export function BreakoutLabView({
  dateDefaults,
  initialData,
}: {
  dateDefaults: StrategyLabDateDefaults;
  initialData: StrategyLabInitialData | null;
}) {
  const lab = useBreakoutLab(dateDefaults, initialData);
  const { config, setConfig, result, running, error } = lab;
  const [assetFilter, setAssetFilter] = useState("");
  const set = <K extends keyof BreakoutConfigState>(k: K, v: BreakoutConfigState[K]) =>
    setConfig((prev) => ({ ...prev, [k]: v }));
  const assets = initialData?.assets ?? [];
  const filteredAssets = useMemo(() => {
    const q = assetFilter.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((asset) =>
      asset.symbol.toLowerCase().includes(q)
      || asset.assetKey.toLowerCase().includes(q)
      || asset.assetClass.toLowerCase().includes(q)
    );
  }, [assetFilter, assets]);

  const agg = result?.aggregate ?? null;
  const port = result?.portfolio ?? null;
  const beatBenchmark =
    port && result?.benchmark?.buyHoldReturnPct != null
      ? port.totalReturnPct - result.benchmark.buyHoldReturnPct
      : null;

  return (
    <div className="space-y-5">
      <div className="sticky top-[64px] z-20 -mx-1 mb-1 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 shadow-[0_18px_40px_rgba(0,0,0,0.25)] backdrop-blur sm:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
          <span className="rounded-full bg-[var(--elevated)] px-2 py-0.5 font-[var(--font-mono)] text-[11px]">
            {lab.parsedAssets.length} 标的 · 放量突破
          </span>
          <span className="font-[var(--font-mono)] text-[11px] text-[var(--faint)]">{config.startDate} → {config.endDate}</span>
          <span className="text-[11px] text-[var(--faint)]">{config.baseCurrency} {config.initialCapital.toLocaleString("en-US")} · 风险 {config.riskPct}%</span>
        </div>
        <DaaSurfaceActionButton
          tone="primary"
          onClick={() => void lab.run()}
          disabled={!lab.canRun}
          className="h-10 px-3 text-xs"
        >
          <Play className="h-3.5 w-3.5" />
          {running ? "运行中…" : "运行回测"}
        </DaaSurfaceActionButton>
      </div>

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      {/* 配置面板 */}
      <div className="space-y-4">
        <DaaSurfacePanel title="标的选择" subtitle="从当前资产池选择要纳入放量突破回测的标的。">
          <div className="space-y-3">
            <input
              type="text"
              value={assetFilter}
              onChange={(e) => setAssetFilter(e.target.value)}
              className={daaSurfaceFieldClassName}
              placeholder="搜索 symbol 或资产类别…"
            />
            <div className="max-h-[240px] space-y-1 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-2">
              {filteredAssets.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-[var(--faint)]">
                  {assets.length === 0 ? "资产池为空，请先到持仓页添加资产" : "未找到匹配资产"}
                </div>
              ) : (
                filteredAssets.map((asset) => {
                  const checked = config.selectedAssets.includes(asset.assetKey);
                  return (
                    <label
                      key={asset.assetKey}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-[var(--elevated)]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => lab.toggleAsset(asset.assetKey)}
                        className="h-3.5 w-3.5 rounded border-[var(--border-strong)] bg-transparent accent-[var(--primary)]"
                      />
                      <span className="font-[var(--font-mono)] text-xs text-[var(--text)]">{asset.symbol}</span>
                      <span className="text-[11px] text-[var(--faint)]">{asset.assetClass}</span>
                      {asset.holdingQty > 0 ? (
                        <span className="ml-auto rounded-full border border-[var(--success-border)] bg-[var(--success-bg)] px-2 py-0.5 text-[9px] font-semibold text-[var(--success)]">持仓</span>
                      ) : null}
                    </label>
                  );
                })
              )}
            </div>
            <div className="text-xs text-[var(--faint)]">已选 {lab.parsedAssets.length} 个标的</div>
          </div>
        </DaaSurfacePanel>

        <DaaSurfacePanel title="回测区间" subtitle="设置择时信号的历史样本范围。">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              <span>开始日期</span>
              <input type="date" value={config.startDate} onChange={(e) => set("startDate", e.target.value)} className={daaSurfaceFieldClassName} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              <span>结束日期</span>
              <input type="date" value={config.endDate} onChange={(e) => set("endDate", e.target.value)} className={daaSurfaceFieldClassName} />
            </label>
          </div>
          <div className="mt-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">常用区间</div>
            <div className="flex flex-wrap gap-2">
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    const endDate = parseDateInput(config.endDate);
                    setConfig((prev) => ({
                      ...prev,
                      startDate: formatDateInput(preset.resolveStartDate(endDate)),
                      endDate: formatDateInput(endDate),
                    }));
                  }}
                  className="inline-flex min-h-10 items-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-bg)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-bg)]"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </DaaSurfacePanel>

        <DaaSurfacePanel title="资金与风控">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="初始资金" value={config.initialCapital} onChange={(v) => set("initialCapital", v)} step={1000} min={1} />
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              <span>基准货币</span>
              <select value={config.baseCurrency} onChange={(e) => set("baseCurrency", e.target.value)} className={daaSurfaceFieldClassName}>
                <option value="USD">USD</option>
                <option value="HKD">HKD</option>
                <option value="CNY">CNY</option>
              </select>
            </label>
            <NumberField label="每笔风险" suffix="%" value={config.riskPct} onChange={(v) => set("riskPct", v)} step={0.5} min={0.1} />
            <NumberField label="最多同时持仓" value={config.maxSlots} onChange={(v) => set("maxSlots", v)} min={1} />
            <NumberField label="止损" suffix="%" value={config.stopPct} onChange={(v) => set("stopPct", v)} step={1} min={1} />
          </div>
        </DaaSurfacePanel>

        <DaaSurfacePanel title="放量突破参数">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="突破回看" suffix="日" value={config.breakoutLookback} onChange={(v) => set("breakoutLookback", v)} min={2} />
            <NumberField label="放量倍数" suffix="×" value={config.volMultiple} onChange={(v) => set("volMultiple", v)} step={0.1} min={0} />
            <NumberField label="快线 MA" value={config.maFast} onChange={(v) => set("maFast", v)} min={2} />
            <NumberField label="慢线 MA" value={config.maSlow} onChange={(v) => set("maSlow", v)} min={3} />
            <NumberField label="最大乖离" suffix="%" value={config.maxExtensionPct} onChange={(v) => set("maxExtensionPct", v)} step={1} min={0} />
            <NumberField label="盈亏比" suffix="R" value={config.rewardMultiple} onChange={(v) => set("rewardMultiple", v)} step={0.5} min={0.5} />
          </div>
          <div className="mt-3 space-y-2">
            <div className="text-xs text-[var(--muted)]">出场模式</div>
            <div className="grid grid-cols-3 gap-2">
              {([
                ["ma", "MA离场", "最敏感·控回撤"],
                ["trailing", "跟踪止损", "5y最优收益"],
                ["target", "持有到目标", "最让利润奔跑"],
              ] as const).map(([mode, label, hint]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => set("exitMode", mode)}
                  className={`rounded-lg border px-2 py-2 text-left text-xs transition ${
                    config.exitMode === mode
                      ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <div className="font-medium">{label}</div>
                  <div className="mt-0.5 text-[10px] text-[var(--muted)]">{hint}</div>
                </button>
              ))}
            </div>
            {config.exitMode === "trailing" ? (
              <NumberField label="跟踪回撤" suffix="%" value={config.trailingPct} onChange={(v) => set("trailingPct", v)} step={1} min={2} />
            ) : null}
          </div>
        </DaaSurfacePanel>

      </div>

      {/* 结果区 */}
      <div className="space-y-5">
        <DashboardErrorNotice title="回测失败" description={error} />

        {running ? (
          <DaaSurfaceEmptyState title="回测运行中…" description="正在获取 OHLCV 并逐笔回放放量突破信号。" className="px-5 py-16" />
        ) : null}

        {result && !running ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <DaaSurfaceMetricCard label="组合收益" value={pct(port?.totalReturnPct)} />
              <DaaSurfaceMetricCard label="最大回撤" value={pct(port?.maxDrawdownPct ? -port.maxDrawdownPct : 0)} />
              <DaaSurfaceMetricCard label="期望值/笔" value={`${r2(agg?.expectancy)}R`} />
              <DaaSurfaceMetricCard label="盈利因子" value={agg?.profitFactor != null && Number.isFinite(agg.profitFactor) ? agg.profitFactor.toFixed(2) : "—"} />
              <DaaSurfaceMetricCard label="胜率" value={agg ? `${agg.winRate.toFixed(0)}%` : "—"} />
              <DaaSurfaceMetricCard label="成交笔数" value={agg ? String(agg.trades) : "—"} />
              <DaaSurfaceMetricCard label="平均盈利" value={`${r2(agg?.avgWinR)}R`} />
              <DaaSurfaceMetricCard label="平均亏损" value={`${r2(agg?.avgLossR)}R`} />
            </div>

            {result.benchmark ? (
              <DaaSurfacePanel title="基准对比">
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <span className="text-[var(--muted)]">本策略组合：<b className="text-[var(--text)]">{pct(port?.totalReturnPct)}</b></span>
                  <span className="text-[var(--muted)]">买入持有 {result.benchmark.symbol}：<b className="text-[var(--text)]">{pct(result.benchmark.buyHoldReturnPct)}</b></span>
                  {beatBenchmark != null ? (
                    <span className={beatBenchmark >= 0 ? "text-[var(--success)]" : "text-rose-400"}>
                      {beatBenchmark >= 0 ? "跑赢" : "跑输"} {pctAbs(beatBenchmark)}
                    </span>
                  ) : null}
                </div>
              </DaaSurfacePanel>
            ) : null}

            {agg?.exitReasonCounts ? (
              <DaaSurfacePanel title="出场原因分布" subtitle="MA离场占比过高 = 突破后回踩被震出，利润被切碎">
                <div className="flex flex-wrap gap-3 text-xs">
                  {Object.entries(agg.exitReasonCounts).map(([k, v]) => (
                    <span key={k} className="rounded bg-[var(--elevated)] px-2 py-1 text-[var(--text)]">{k}: {v}</span>
                  ))}
                </div>
              </DaaSurfacePanel>
            ) : null}

            <DaaSurfacePanel title="分标的表现">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[var(--muted)]">
                    <tr className="text-left">
                      <th className="py-1 pr-3">标的</th>
                      <th className="py-1 pr-3">笔数</th>
                      <th className="py-1 pr-3">胜率</th>
                      <th className="py-1 pr-3">期望R</th>
                      <th className="py-1 pr-3">盈利因子</th>
                      <th className="py-1 pr-3">累计R</th>
                    </tr>
                  </thead>
                  <tbody className="text-[var(--text)]">
                    {result.perSymbol.map((s) => (
                      <tr key={s.assetKey} className="border-t border-[var(--border)]">
                        <td className="py-1 pr-3 font-mono">{s.assetKey}</td>
                        <td className="py-1 pr-3">{s.trades}</td>
                        <td className="py-1 pr-3">{s.winRate.toFixed(0)}%</td>
                        <td className="py-1 pr-3">{r2(s.expectancy)}</td>
                        <td className="py-1 pr-3">{Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞"}</td>
                        <td className={`py-1 pr-3 ${s.totalR >= 0 ? "text-[var(--success)]" : "text-rose-400"}`}>{r2(s.totalR)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DaaSurfacePanel>

            {result.warnings.length ? (
              <DaaSurfacePanel title={`提示 (${result.warnings.length})`}>
                <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--muted)]">
                  {result.warnings.slice(0, 12).map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </DaaSurfacePanel>
            ) : null}

            <p className="text-xs text-[var(--muted)]">回测是历史统计，不代表未来；非投资建议。</p>
          </>
        ) : null}

        {!result && !running ? (
          <DaaSurfaceEmptyState
            title="等待回测"
            description="在左侧选择标的、区间和放量突破参数，点击顶部「运行回测」。"
            className="px-5 py-20"
          />
        ) : null}
      </div>
      </div>
    </div>
  );
}
