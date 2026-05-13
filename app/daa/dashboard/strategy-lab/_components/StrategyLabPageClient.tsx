"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Play, History, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

import { DashboardEmptyState, DashboardErrorNotice } from "@/app/daa/dashboard/_components/DashboardFeedback";
import {
  DaaSurfaceActionButton,
  DaaSurfaceEmptyState,
  DaaSurfaceMetricCard,
  DaaSurfaceNoticeBox,
  DaaSurfacePageHeader,
  DaaSurfacePanel,
  DaaSurfaceStatusPill,
  daaSurfaceFieldClassName,
  daaSurfaceTableHeadClassName,
  daaSurfaceTableCellClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatDateTime } from "@/app/daa/dashboard/_components/daaFormatters";
import { getWorkbenchReadModel } from "@/src/daa/modules/read/readApi";
import { applyWorkbenchTargetWeights } from "@/src/daa/modules/workbench/targetAllocationApply";
import { runBacktest, getBacktestHistory } from "@/src/daa/modules/strategyLab/strategyLabApi";
import type {
  StrategyLabRunParams,
  StrategyLabRunResult,
  StrategyLabHistoryItem,
} from "@/src/daa/modules/strategyLab/strategyLabTypes";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const STRATEGY_OPTIONS = [
  { key: "equalWeight", label: "等权重", desc: "按相同比例配置所有资产" },
  { key: "momentum", label: "动量", desc: "超配近期表现好的资产" },
  { key: "riskParity", label: "风险平价", desc: "按波动率倒数分配权重" },
  { key: "minVariance", label: "最小方差", desc: "最小化组合整体波动率" },
  { key: "baseline", label: "基准等权", desc: "与等权相同，用作对照" },
] as const;

const FREQUENCY_OPTIONS = [
  { value: "monthly", label: "月度" },
  { value: "quarterly", label: "季度" },
  { value: "semiannual", label: "半年" },
  { value: "annual", label: "年度" },
] as const;

const BASE_CURRENCY_OPTIONS = ["USD", "HKD", "CNY"] as const;

const CHART_COLORS = {
  muted: "hsl(215 16% 57%)",
  tooltipBg: "hsl(222 47% 11%)",
  tooltipBorder: "hsla(215,16%,57%,0.2)",
  grid: "hsla(215,16%,57%,0.12)",
} as const;

const STRATEGY_LINE_COLORS: Record<string, string> = {
  equalWeight: "hsl(199 89% 60%)",
  momentum: "hsl(43 96% 56%)",
  riskParity: "hsl(160 60% 55%)",
  minVariance: "hsl(280 65% 65%)",
  baseline: "hsl(215 16% 57%)",
};

function strategyLabel(key: string): string {
  return STRATEGY_OPTIONS.find((s) => s.key === key)?.label ?? key;
}

function defaultStartDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

function defaultEndDate(): string {
  return new Date().toISOString().slice(0, 10);
}

type ConfigState = {
  selectedAssets: string[];
  selectedStrategies: string[];
  startDate: string;
  endDate: string;
  rebalanceFrequency: string;
  initialCapital: number;
  baseCurrency: string;
};

const DEFAULT_CONFIG: ConfigState = {
  selectedAssets: [],
  selectedStrategies: ["equalWeight"],
  startDate: defaultStartDate(),
  endDate: defaultEndDate(),
  rebalanceFrequency: "monthly",
  initialCapital: 100_000,
  baseCurrency: "USD",
};

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------

export default function StrategyLabPageClient() {
  // ---------- 资产池 ----------
  const [assets, setAssets] = useState<AssetUniverseView[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);

  // ---------- 配置 ----------
  const [config, setConfig] = useState<ConfigState>(DEFAULT_CONFIG);

  // ---------- 运行状态 ----------
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<StrategyLabRunResult | null>(null);
  const [error, setError] = useState("");

  // ---------- 历史 ----------
  const [history, setHistory] = useState<StrategyLabHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ---------- 应用权重 ----------
  const [applying, setApplying] = useState(false);

  // ---------- 资产筛选 ----------
  const [assetFilter, setAssetFilter] = useState("");

  // ---------- 加载资产池 ----------
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const model = await getWorkbenchReadModel({ syncPrices: false });
        if (!cancelled) {
          setAssets(model.bootstrap.assetUniverse);
          // 默认选中所有持仓 > 0 或已 watch 的资产
          const defaultSelection = model.bootstrap.assetUniverse
            .filter((a) => a.holdingQty > 0 || a.watchEnabled)
            .map((a) => a.assetKey);
          setConfig((prev) => ({
            ...prev,
            selectedAssets: defaultSelection.length > 0 ? defaultSelection : prev.selectedAssets,
            baseCurrency: model.bootstrap.baseCurrency || prev.baseCurrency,
          }));
        }
      } catch {
        // 静默处理，用户可手动输入资产
      } finally {
        if (!cancelled) setAssetsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---------- 加载历史 ----------
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const items = await getBacktestHistory(10);
      setHistory(items);
    } catch {
      // 静默处理
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // ---------- 执行回测 ----------
  const handleRun = useCallback(async () => {
    if (running) return;
    if (config.selectedAssets.length === 0) {
      setError("请至少选择一个资产");
      return;
    }
    if (config.selectedStrategies.length === 0) {
      setError("请至少选择一个策略");
      return;
    }
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const params: StrategyLabRunParams = {
        assets: config.selectedAssets,
        strategies: config.selectedStrategies,
        startDate: config.startDate,
        endDate: config.endDate,
        rebalanceFrequency: config.rebalanceFrequency,
        initialCapital: config.initialCapital,
        baseCurrency: config.baseCurrency,
      };
      const res = await runBacktest(params);
      setResult(res);
      void loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "回测执行失败");
    } finally {
      setRunning(false);
    }
  }, [running, config, loadHistory]);

  // ---------- 资产切换 ----------
  const toggleAsset = useCallback((assetKey: string) => {
    setConfig((prev) => {
      const next = prev.selectedAssets.includes(assetKey)
        ? prev.selectedAssets.filter((k) => k !== assetKey)
        : [...prev.selectedAssets, assetKey];
      return { ...prev, selectedAssets: next };
    });
  }, []);

  const toggleStrategy = useCallback((key: string) => {
    setConfig((prev) => {
      const next = prev.selectedStrategies.includes(key)
        ? prev.selectedStrategies.filter((k) => k !== key)
        : [...prev.selectedStrategies, key];
      return { ...prev, selectedStrategies: next };
    });
  }, []);

  // ---------- 筛选后的资产列表 ----------
  const filteredAssets = useMemo(() => {
    if (!assetFilter.trim()) return assets;
    const q = assetFilter.trim().toLowerCase();
    return assets.filter(
      (a) =>
        a.symbol.toLowerCase().includes(q) ||
        a.assetKey.toLowerCase().includes(q) ||
        a.assetClass.toLowerCase().includes(q),
    );
  }, [assets, assetFilter]);

  // ---------- 图表数据 ----------
  const strategyResults = useMemo(() => {
    if (!result) return [];
    if (result.strategyResults?.length) return result.strategyResults;
    return [{
      strategy: result.params.strategies[0] || "equalWeight",
      equityCurve: result.equityCurve,
      metrics: result.metrics,
      attribution: result.attribution,
      targetWeights: result.targetWeights || {},
      warnings: [],
    }];
  }, [result]);

  const chartData = useMemo(() => {
    if (!strategyResults.length) return [];
    const rows = new Map<string, Record<string, string | number>>();
    for (const strategyResult of strategyResults) {
      for (const point of strategyResult.equityCurve || []) {
        const row = rows.get(point.date) || {
          date: point.date.slice(5, 10),
          fullDate: point.date,
        };
        row[strategyResult.strategy] = +point.equity.toFixed(2);
        rows.set(point.date, row);
      }
    }
    return [...rows.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, row]) => row);
  }, [strategyResults]);

  return (
    <div className="space-y-6 lg:space-y-7">
      {/* ---- 页头 ---- */}
      <DaaSurfacePageHeader
        eyebrow="策略回测"
        title="策略实验室"
        description="回测你的资产配置策略，对比基准，评估风险调整后收益。"
        actions={
          <DaaSurfaceActionButton
            tone="primary"
            disabled={running || config.selectedAssets.length === 0 || config.selectedStrategies.length === 0}
            onClick={() => void handleRun()}
          >
            <Play className="h-4 w-4" />
            {running ? "回测运行中…" : "运行回测"}
          </DaaSurfaceActionButton>
        }
      />

      <DashboardErrorNotice title="回测失败" description={error} />

      {/* ---- 主体：配置 + 结果 ---- */}
      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        {/* ========== 左侧配置面板 ========== */}
        <div className="space-y-5 xl:sticky xl:top-[104px] xl:self-start">
          {/* -- 资产选择 -- */}
          <DaaSurfacePanel accent="cyan" title="资产选择" subtitle="从当前资产池中选择要回测的资产。">
            <div className="space-y-3">
              <input
                type="text"
                placeholder="搜索 symbol 或资产类别…"
                value={assetFilter}
                onChange={(e) => setAssetFilter(e.target.value)}
                className={daaSurfaceFieldClassName}
              />
              <div className="max-h-[240px] space-y-1 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[rgba(8,12,20,0.58)] p-2">
                {assetsLoading ? (
                  <div className="px-3 py-4 text-center text-xs text-[var(--faint)]">加载资产池中…</div>
                ) : filteredAssets.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-[var(--faint)]">
                    {assets.length === 0 ? "资产池为空，请先到持仓页添加资产" : "未找到匹配资产"}
                  </div>
                ) : (
                  filteredAssets.map((asset) => {
                    const checked = config.selectedAssets.includes(asset.assetKey);
                    return (
                      <label
                        key={asset.assetKey}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAsset(asset.assetKey)}
                          className="h-3.5 w-3.5 rounded border-[var(--border-strong)] bg-transparent accent-[var(--primary)]"
                        />
                        <span className="font-[var(--font-mono)] text-xs text-[var(--text)]">{asset.symbol}</span>
                        <span className="text-[11px] text-[var(--faint)]">{asset.assetClass}</span>
                        {asset.holdingQty > 0 ? (
                          <DaaSurfaceStatusPill tone="green" className="ml-auto text-[9px]">持仓</DaaSurfaceStatusPill>
                        ) : null}
                      </label>
                    );
                  })
                )}
              </div>
              <div className="text-xs text-[var(--faint)]">
                已选 {config.selectedAssets.length} 个资产
              </div>
            </div>
          </DaaSurfacePanel>

          {/* -- 策略选择 -- */}
          <DaaSurfacePanel accent="indigo" title="策略选择" subtitle="选择一个或多个配置策略进行对比回测。">
            <div className="space-y-1">
              {STRATEGY_OPTIONS.map((s) => {
                const checked = config.selectedStrategies.includes(s.key);
                return (
                  <label
                    key={s.key}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStrategy(s.key)}
                      className="h-3.5 w-3.5 rounded border-[var(--border-strong)] bg-transparent accent-[var(--primary)]"
                    />
                    <div>
                      <span className="text-[var(--text)]">{s.label}</span>
                      <span className="ml-2 text-[11px] text-[var(--faint)]">{s.desc}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </DaaSurfacePanel>

          {/* -- 参数配置 -- */}
          <DaaSurfacePanel accent="amber" title="回测参数" subtitle="设定回测区间、再平衡频率与初始资金。">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">起始日期</label>
                <input
                  type="date"
                  value={config.startDate}
                  onChange={(e) => setConfig((prev) => ({ ...prev, startDate: e.target.value }))}
                  className={daaSurfaceFieldClassName}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">结束日期</label>
                <input
                  type="date"
                  value={config.endDate}
                  onChange={(e) => setConfig((prev) => ({ ...prev, endDate: e.target.value }))}
                  className={daaSurfaceFieldClassName}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">再平衡频率</label>
                <select
                  value={config.rebalanceFrequency}
                  onChange={(e) => setConfig((prev) => ({ ...prev, rebalanceFrequency: e.target.value }))}
                  className={daaSurfaceFieldClassName}
                >
                  {FREQUENCY_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">基准货币</label>
                <select
                  value={config.baseCurrency}
                  onChange={(e) => setConfig((prev) => ({ ...prev, baseCurrency: e.target.value }))}
                  className={daaSurfaceFieldClassName}
                >
                  {BASE_CURRENCY_OPTIONS.map((currency) => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">初始资金 ({config.baseCurrency})</label>
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={config.initialCapital}
                  onChange={(e) => setConfig((prev) => ({ ...prev, initialCapital: Math.max(1000, Number(e.target.value) || 100_000) }))}
                  className={daaSurfaceFieldClassName}
                />
              </div>
            </div>
          </DaaSurfacePanel>
        </div>

        {/* ========== 右侧结果面板 ========== */}
        <div className="space-y-5">
          {/* -- 运行中占位 -- */}
          {running ? (
            <DashboardEmptyState
              title="回测运行中…"
              description="正在获取价格数据并执行策略模拟，请稍候。"
              className="px-5 py-16"
            />
          ) : null}

          {/* -- 结果区域 -- */}
          {result && !running ? (
            <>
              {/* 警告信息 */}
              {result.warnings.length > 0 ? (
                <DaaSurfaceNoticeBox
                  tone="amber"
                  title="回测警告"
                  icon={<AlertTriangle className="h-4 w-4" />}
                >
                  <ul className="list-inside list-disc space-y-1 text-xs text-[var(--muted)]">
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </DaaSurfaceNoticeBox>
              ) : null}

              {/* 核心指标 */}
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <DaaSurfaceMetricCard
                  label="总收益"
                  value={`${(result.metrics.totalReturn * 100).toFixed(2)}%`}
                  subLabel={`夏普比率 ${result.attribution.metrics.sharpe.toFixed(2)}`}
                  accent={result.metrics.totalReturn >= 0 ? "green" : "red"}
                />
                <DaaSurfaceMetricCard
                  label="最大回撤"
                  value={`${(result.attribution.metrics.maxDrawdown * 100).toFixed(2)}%`}
                  subLabel={`年化波动率 ${(result.attribution.metrics.volatility * 100).toFixed(2)}%`}
                  accent="amber"
                />
                <DaaSurfaceMetricCard
                  label="Calmar 比率"
                  value={result.attribution.metrics.calmar.toFixed(2)}
                  subLabel={`胜率 ${(result.attribution.metrics.winRate * 100).toFixed(1)}%`}
                  accent="indigo"
                />
              </div>

              {strategyResults.length > 1 ? (
                <DaaSurfacePanel accent="slate" title="策略对比" subtitle="同一资产池、同一区间下的多策略回测结果。">
                  <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)]">
                    <table className="w-full border-collapse bg-[rgba(8,12,20,0.32)]">
                      <thead>
                        <tr>
                          <th className={daaSurfaceTableHeadClassName}>策略</th>
                          <th className={`${daaSurfaceTableHeadClassName} text-right`}>总收益</th>
                          <th className={`${daaSurfaceTableHeadClassName} text-right`}>夏普</th>
                          <th className={`${daaSurfaceTableHeadClassName} text-right`}>最大回撤</th>
                          <th className={`${daaSurfaceTableHeadClassName} text-right`}>胜率</th>
                        </tr>
                      </thead>
                      <tbody>
                        {strategyResults.map((item) => (
                          <tr key={item.strategy}>
                            <td className={`${daaSurfaceTableCellClassName} text-[var(--text)]`}>{strategyLabel(item.strategy)}</td>
                            <td
                              className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)]`}
                              style={{ color: item.metrics.totalReturn >= 0 ? "var(--success)" : "var(--danger)" }}
                            >
                              {item.metrics.totalReturn >= 0 ? "+" : ""}{(item.metrics.totalReturn * 100).toFixed(2)}%
                            </td>
                            <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)] text-[var(--text)]`}>
                              {item.metrics.sharpe.toFixed(2)}
                            </td>
                            <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)] text-[var(--muted)]`}>
                              {(item.metrics.maxDrawdown * 100).toFixed(2)}%
                            </td>
                            <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)] text-[var(--muted)]`}>
                              {(item.metrics.winRate * 100).toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </DaaSurfacePanel>
              ) : null}

              {/* 权益曲线 */}
              <DaaSurfacePanel accent="cyan" title="权益曲线" subtitle="回测期间的资产净值走势。">
                {chartData.length >= 2 ? (
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                          width={60}
                          domain={["auto", "auto"]}
                          tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                        />
                        <Tooltip
                          contentStyle={{
                            background: CHART_COLORS.tooltipBg,
                            border: `1px solid ${CHART_COLORS.tooltipBorder}`,
                            borderRadius: 14,
                          }}
                          formatter={(value: number | undefined) => [
                            `$${(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                            "净值",
                          ]}
                          labelFormatter={(label: unknown) => `${String(label)}`}
                        />
                        <Legend verticalAlign="bottom" height={28} iconType="line" wrapperStyle={{ fontSize: 11 }} />
                        {strategyResults.map((item) => (
                          <Line
                            key={item.strategy}
                            type="monotone"
                            dataKey={item.strategy}
                            name={strategyLabel(item.strategy)}
                            stroke={STRATEGY_LINE_COLORS[item.strategy] || STRATEGY_LINE_COLORS.equalWeight}
                            strokeWidth={2.2}
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <DashboardEmptyState title="数据点不足" description="权益曲线至少需要两个数据点。" className="py-10" />
                )}
              </DaaSurfacePanel>

              {/* 归因分析 */}
              {result.attribution.perAsset.length > 0 ? (
                <DaaSurfacePanel accent="indigo" title="资产归因" subtitle="各资产对组合收益的贡献明细。">
                  <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)]">
                    <table className="w-full border-collapse bg-[rgba(8,12,20,0.32)]">
                      <thead>
                        <tr>
                          <th className={daaSurfaceTableHeadClassName}>资产</th>
                          <th className={`${daaSurfaceTableHeadClassName} text-right`}>平均权重</th>
                          <th className={`${daaSurfaceTableHeadClassName} text-right`}>资产收益</th>
                          <th className={`${daaSurfaceTableHeadClassName} text-right`}>贡献度</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.attribution.perAsset.map((item) => (
                          <tr key={item.symbol}>
                            <td className={`${daaSurfaceTableCellClassName} font-[var(--font-mono)] text-[var(--text)]`}>{item.symbol}</td>
                            <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)] text-[var(--muted)]`}>{(item.avgWeight * 100).toFixed(1)}%</td>
                            <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)]`} style={{ color: item.assetReturn >= 0 ? "var(--success)" : "var(--danger)" }}>
                              {item.assetReturn >= 0 ? "+" : ""}{(item.assetReturn * 100).toFixed(2)}%
                            </td>
                            <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)]`} style={{ color: item.contributionToReturn >= 0 ? "var(--success)" : "var(--danger)" }}>
                              {item.contributionToReturn >= 0 ? "+" : ""}{(item.contributionToReturn * 100).toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* 基准对比 */}
                  {result.attribution.benchmark.return != null ? (
                    <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[rgba(8,12,20,0.58)] px-4 py-3">
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="text-[var(--faint)]">基准 ({result.attribution.benchmark.symbol})</span>
                        <span className="font-[var(--font-mono)] text-[var(--text)]">
                          {(result.attribution.benchmark.return * 100).toFixed(2)}%
                        </span>
                        {result.attribution.activeReturn != null ? (
                          <>
                            <span className="text-[var(--faint)]">超额收益</span>
                            <span
                              className="font-[var(--font-mono)]"
                              style={{ color: result.attribution.activeReturn >= 0 ? "var(--success)" : "var(--danger)" }}
                            >
                              {result.attribution.activeReturn >= 0 ? "+" : ""}{(result.attribution.activeReturn * 100).toFixed(2)}%
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </DaaSurfacePanel>
              ) : null}

              {/* 应用回测权重为目标配置 */}
              {result?.targetWeights && Object.keys(result.targetWeights).length > 0 && (
                <div className="flex items-center gap-3 rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] px-4 py-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-[var(--text)]">应用 {strategyLabel(result.primaryStrategy || result.params.strategies[0] || "equalWeight")} 权重</div>
                    <div className="mt-0.5 text-xs text-[var(--muted)]">
                      将本次回测末期的策略目标权重作为当前目标配置
                    </div>
                  </div>
                  <DaaSurfaceActionButton
                    tone="primary"
                    disabled={applying}
                    onClick={async () => {
                      if (!result?.targetWeights) return;
                      setApplying(true);
                      try {
                        await applyWorkbenchTargetWeights(result.targetWeights);
                        const nextModel = await getWorkbenchReadModel({ syncPrices: false });
                        setAssets(nextModel.bootstrap.assetUniverse);
                        toast.success("已将回测权重应用为目标配置");
                      } catch (err) {
                        toast.error("应用失败：" + (err instanceof Error ? err.message : "未知错误"));
                      } finally {
                        setApplying(false);
                      }
                    }}
                  >
                    {applying ? "应用中…" : "应用为目标权重"}
                  </DaaSurfaceActionButton>
                </div>
              )}

              {/* 再平衡事件 */}
              {result.attribution.rebalanceEvents.length > 0 ? (
                <DaaSurfacePanel accent="amber" title="再平衡事件" subtitle="回测期间触发的再平衡记录。">
                  <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)]">
                    <table className="w-full border-collapse bg-[rgba(8,12,20,0.32)]">
                      <thead>
                        <tr>
                          <th className={daaSurfaceTableHeadClassName}>日期</th>
                          <th className={`${daaSurfaceTableHeadClassName} text-right`}>换手率</th>
                          <th className={`${daaSurfaceTableHeadClassName} text-right`}>触发前偏移</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.attribution.rebalanceEvents.map((evt, i) => (
                          <tr key={i}>
                            <td className={`${daaSurfaceTableCellClassName} font-[var(--font-mono)] text-[var(--text)]`}>{evt.date}</td>
                            <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)] text-[var(--muted)]`}>{(evt.turnoverPct * 100).toFixed(2)}%</td>
                            <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)] text-[var(--muted)]`}>{(evt.driftBefore * 100).toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </DaaSurfacePanel>
              ) : null}
            </>
          ) : null}

          {/* -- 无结果占位 -- */}
          {!result && !running ? (
            <DaaSurfaceEmptyState
              title="等待回测"
              description="在左侧面板选择资产和策略，设置回测参数后点击「运行回测」开始。"
              className="px-5 py-20"
            />
          ) : null}

          {/* -- 历史记录 -- */}
          <DaaSurfacePanel
            accent="slate"
            title="回测历史"
            subtitle="最近 10 次回测运行记录。"
            action={
              <DaaSurfaceActionButton onClick={() => void loadHistory()} disabled={historyLoading}>
                <History className="h-3.5 w-3.5" />
                {historyLoading ? "加载中…" : "刷新"}
              </DaaSurfaceActionButton>
            }
          >
            {history.length > 0 ? (
              <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)]">
                <table className="w-full border-collapse bg-[rgba(8,12,20,0.32)]">
                  <thead>
                    <tr>
                      <th className={daaSurfaceTableHeadClassName}>运行时间</th>
                      <th className={daaSurfaceTableHeadClassName}>区间</th>
                      <th className={`${daaSurfaceTableHeadClassName} text-right`}>总收益</th>
                      <th className={`${daaSurfaceTableHeadClassName} text-right`}>夏普</th>
                      <th className={`${daaSurfaceTableHeadClassName} text-right`}>最大回撤</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => (
                      <tr key={item.runId}>
                        <td className={`${daaSurfaceTableCellClassName} text-[var(--muted)]`}>{formatDateTime(item.createdAt)}</td>
                        <td className={`${daaSurfaceTableCellClassName} font-[var(--font-mono)] text-xs text-[var(--faint)]`}>
                          {item.startDate} ~ {item.endDate}
                        </td>
                        <td
                          className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)]`}
                          style={{ color: (item.metrics?.totalReturn ?? 0) >= 0 ? "var(--success)" : "var(--danger)" }}
                        >
                          {((item.metrics?.totalReturn ?? 0) * 100).toFixed(2)}%
                        </td>
                        <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)] text-[var(--text)]`}>
                          {(item.metrics?.sharpe ?? 0).toFixed(2)}
                        </td>
                        <td className={`${daaSurfaceTableCellClassName} text-right font-[var(--font-mono)] text-[var(--muted)]`}>
                          {((item.metrics?.maxDrawdown ?? 0) * 100).toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <DaaSurfaceEmptyState
                title="暂无回测历史"
                description={historyLoading ? "加载中…" : "选择资产和策略，运行您的第一次回测，结果会自动记录到这里。"}
                className="py-10"
              />
            )}
          </DaaSurfacePanel>
        </div>
      </div>
    </div>
  );
}
