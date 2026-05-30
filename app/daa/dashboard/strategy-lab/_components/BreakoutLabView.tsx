"use client";

import {
  DaaSurfaceMetricCard,
  DaaSurfacePanel,
  DaaSurfaceActionButton,
  DaaSurfaceEmptyState,
  daaSurfaceFieldClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { DashboardErrorNotice } from "@/app/daa/dashboard/_components/DashboardFeedback";
import { useBreakoutLab, type BreakoutConfigState } from "./useBreakoutLab";

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
function r2(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;
}

export function BreakoutLabView() {
  const lab = useBreakoutLab();
  const { config, setConfig, result, running, error } = lab;
  const set = <K extends keyof BreakoutConfigState>(k: K, v: BreakoutConfigState[K]) =>
    setConfig((prev) => ({ ...prev, [k]: v }));

  const agg = result?.aggregate ?? null;
  const port = result?.portfolio ?? null;
  const beatBenchmark =
    port && result?.benchmark?.buyHoldReturnPct != null
      ? port.totalReturnPct - result.benchmark.buyHoldReturnPct
      : null;

  return (
    <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      {/* 配置面板 */}
      <div className="space-y-4">
        <DaaSurfacePanel title="标的与区间" subtitle="逗号或空格分隔；可用 NVDA 或 US::NVDA">
          <div className="space-y-3">
            <textarea
              value={config.assetsText}
              onChange={(e) => set("assetsText", e.target.value)}
              rows={3}
              className={daaSurfaceFieldClassName}
              placeholder="NVDA, AAPL, MSFT"
            />
            <div className="text-xs text-[var(--muted)]">已解析 {lab.parsedAssets.length} 个标的</div>
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
          </div>
        </DaaSurfacePanel>

        <DaaSurfacePanel title="资金与风控">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="初始资金" value={config.initialCapital} onChange={(v) => set("initialCapital", v)} step={1000} min={1} />
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

        <DaaSurfaceActionButton onClick={() => void lab.run()} disabled={!lab.canRun} className="w-full">
          {running ? "回测运行中…" : "运行放量突破回测"}
        </DaaSurfaceActionButton>
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
                      {beatBenchmark >= 0 ? "跑赢" : "跑输"} {pct(Math.abs(beatBenchmark))}
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
            description="在左侧设置标的、区间和放量突破参数，点击「运行放量突破回测」。"
            className="px-5 py-20"
          />
        ) : null}
      </div>
    </div>
  );
}
