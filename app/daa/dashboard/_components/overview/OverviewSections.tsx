"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCcw } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatCurrencyCompact } from "@/app/daa/dashboard/_components/daaFormatters";
import { DashboardEmptyState, DashboardErrorNotice } from "@/app/daa/dashboard/_components/DashboardFeedback";
import {
  DeepLedgerActionButton,
  DeepLedgerMetricCard,
  DeepLedgerMiniStat,
  DeepLedgerPageHeader,
  DeepLedgerPanel,
  DeepLedgerStatusPill,
  type DeepLedgerTone,
} from "@/app/daa/dashboard/_components/DeepLedgerUI";
import type { PortfolioOverviewModel } from "@/app/daa/dashboard/_hooks/usePortfolioOverviewModel";
import type { DaaMarketIndicatorKey, DaaMarketIndicatorScope } from "@/src/daa/modules/marketContext/marketContextTypes";
import { MARKET_SCOPE_LABEL_ZH_ } from "@/src/daa/modules/marketContext/marketIndicatorCatalog";

const PIE_COLORS = ["#38BDF8", "#818CF8", "#F6AD55", "#34D399", "#F87171", "#A78BFA", "#6EE7B7"];
const MARKET_INDICATOR_LINE_META_: Record<DaaMarketIndicatorKey, { label: string; color: string }> = {
  vix: { label: "美股恐慌指数 (VIX)", color: "#38BDF8" },
  qqq_spy_ratio: { label: "美股成长/大盘比 (QQQ/SPY)", color: "#818CF8" },
  fxi_volatility: { label: "港中概波动率 (FXI)", color: "#F87171" },
  kweb_fxi_ratio: { label: "中概互联/大盘比 (KWEB/FXI)", color: "#F6AD55" },
  btc_eth_ratio: { label: "比特币/以太坊比 (BTC/ETH)", color: "#34D399" },
  btc_volatility: { label: "比特币波动率 (BTC)", color: "#A78BFA" },
  gold_silver_ratio: { label: "金银比 (GC/SI)", color: "#FBBF24" },
};
function alertTone(level: "info" | "warn" | "success"): DeepLedgerTone {
  if (level === "warn") return "amber";
  if (level === "success") return "green";
  return "cyan";
}

function marketRegimeTone(regime: string | null | undefined): DeepLedgerTone {
  if (regime === "risk_off") return "amber";
  if (regime === "risk_on") return "green";
  return "indigo";
}

function marketRegimeLabel(regime: string | null | undefined) {
  if (regime === "risk_off") return "偏防守";
  if (regime === "risk_on") return "偏进攻";
  if (regime === "transitional") return "过渡";
  return "待计算";
}

function formatIndicatorValue(value: number | null | undefined, unit?: string) {
  if (value == null || !Number.isFinite(value)) return "N/A";
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (unit === "x") return `${value.toFixed(2)}x`;
  if (Math.abs(value) >= 100) return value.toFixed(1);
  if (Math.abs(value) >= 10) return value.toFixed(2);
  return value.toFixed(3);
}

function marketPercentileText(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "近一年位置 N/A";
  const zone = value >= 80 ? "极高" : value >= 60 ? "偏高" : value > 40 ? "中性" : value > 20 ? "偏低" : "极低";
  return `近一年位置 ${value.toFixed(1)}% · ${zone}`;
}

function formatCashMeta(row: PortfolioOverviewModel["cashLedger"][number]) {
  const tags = [row.entryKind, row.baseCurrency, row.accountBaseCurrency].filter(Boolean);
  if (row.ticketId) tags.push(`ticket:${row.ticketId}`);
  if (row.cycleId) tags.push(`cycle:${row.cycleId}`);
  return tags;
}

function OverviewChartFrame({
  height,
  children,
}: {
  height: number;
  children: (size: { width: number; height: number }) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setWidth(Math.max(0, Math.floor(node.getBoundingClientRect().width)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return <div ref={ref} className="w-full" style={{ height }}>{width > 0 ? children({ width, height }) : null}</div>;
}

export function OverviewSummaryHeader({ model }: { model: PortfolioOverviewModel }) {
  const marketRegime = model.bootstrap?.marketContext?.regime;
  return (
    <>
      <DeepLedgerPageHeader
        eyebrow="组合总览"
        title="组合总览"
        description="集中查看账户权益、现金、市场状态与近期风险，帮助你快速决定下一步动作。"
        actions={(
          <>
            <DeepLedgerActionButton tone="slate" onClick={() => void model.load(true)} disabled={model.refreshing || model.loading}>
              <RefreshCcw className={`h-4 w-4 ${model.refreshing ? "animate-spin" : ""}`} />
              刷新总览
            </DeepLedgerActionButton>
          </>
        )}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DeepLedgerMetricCard label="总权益" value={formatCurrencyCompact(model.totalEquity, model.baseCurrency)} subLabel={`日内变化 ${formatCurrency(model.dailyPnl, model.baseCurrency)}`} accent="cyan" />
        <DeepLedgerMetricCard label="持仓市值" value={formatCurrencyCompact(model.holdingsValue, model.baseCurrency)} subLabel={`当前持仓 ${model.holdingCount} 个`} accent="indigo" />
        <DeepLedgerMetricCard label="账户现金" value={formatCurrencyCompact(model.cashValue, model.baseCurrency)} subLabel={`可投资 ${formatCurrency(model.bootstrap?.account.investableCash ?? 0, model.baseCurrency)}`} accent="amber" />
        <DeepLedgerMetricCard
          label="市场状态"
          value={marketRegimeLabel(marketRegime)}
          subLabel={model.bootstrap?.marketContext?.generatedAt ? `更新时间 ${model.bootstrap.marketContext.generatedAt.slice(5, 16).replace("T", " ")}` : "等待市场状态层输出"}
          accent={marketRegimeTone(marketRegime)}
        />
      </div>
    </>
  );
}

export function OverviewRunSummaryPanel({ model }: { model: PortfolioOverviewModel }) {
  const latestCycle = model.bootstrap?.latestCycle || null;
  return (
    <DeepLedgerPanel
      accent="indigo"
      title="运行摘要"
      subtitle="把最近一次再平衡、执行记录和系统提醒放在一起，便于判断是否需要立即处理。"
      action={(
        <Link href="/daa/dashboard/workbench" className="inline-flex items-center rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition-colors hover:border-[var(--primary)]/40 hover:text-[var(--text)]">
          去工作台
        </Link>
      )}
    >
      <div className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-3 md:grid-cols-3">
          <DeepLedgerMiniStat label="最新周期" value={latestCycle ? latestCycle.cycleId.slice(0, 8) : "-"} hint={latestCycle ? `${latestCycle.triggerSource} · ${latestCycle.status}` : "暂无周期"} tone="indigo" />
          <DeepLedgerMiniStat label="执行日志" value={String(model.bootstrap?.execution.logs.length || 0)} hint="最近交易工单" tone="cyan" />
          <DeepLedgerMiniStat label="系统警告" value={String(model.bootstrap?.warnings.length || 0)} hint="待处理提醒数" tone={(model.bootstrap?.warnings.length || 0) > 0 ? "amber" : "green"} />
        </div>

        <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.6)] p-4 text-sm text-[var(--muted)]">
          {latestCycle ? (
            <>
              <div className="font-semibold text-[var(--text)]">{latestCycle.triggerReason}</div>
              <div className="mt-2">状态：{latestCycle.status}</div>
              <div className="mt-1">快照时间：{latestCycle.snapshotAt.slice(0, 16).replace("T", " ")}</div>
              <div className="mt-1">提案数：{latestCycle.proposals.length}，风控 {latestCycle.riskCheck.overallStatus}</div>
            </>
          ) : (
            <div>当前还没有可展示的再平衡周期，可先去工作台生成一轮建议。</div>
          )}
        </div>
      </div>
    </DeepLedgerPanel>
  );
}

export function OverviewMarketTemperaturePanel({ model }: { model: PortfolioOverviewModel }) {
  const indicators = model.selectedScopeContext?.indicators || [];
  const freshnessTotal = (model.bootstrap?.marketDataHealth?.freshCount || 0) + (model.bootstrap?.marketDataHealth?.staleCount || 0) + (model.bootstrap?.marketDataHealth?.missingCount || 0);
  const freshnessPct = freshnessTotal > 0 ? Math.round(((model.bootstrap?.marketDataHealth?.freshCount || 0) / freshnessTotal) * 100) : 0;
  const healthTone: DeepLedgerTone = freshnessPct >= 80 ? "green" : freshnessPct >= 40 ? "amber" : "red";
  return (
    <DeepLedgerPanel
      accent="amber"
      title="市场温度"
      subtitle="结合市场状态与历史变化，帮助判断当前更适合进攻、防守还是观望。"
      action={(
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-[var(--border)] bg-[rgba(255,255,255,0.03)] p-1">
            {[30, 90].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => model.setMarketHistoryRange(days as 30 | 90)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${model.marketHistoryRange === days ? "bg-[var(--primary)] text-[var(--bg)]" : "text-[var(--muted)] hover:text-[var(--text)]"}`}
              >
                {days}天
              </button>
            ))}
          </div>
          <DeepLedgerActionButton tone="slate" onClick={() => void model.handleRefreshMarketContext()} disabled={model.marketContextRefreshing}>
            <RefreshCcw className={`h-4 w-4 ${model.marketContextRefreshing ? "animate-spin" : ""}`} />
            刷新市场状态
          </DeepLedgerActionButton>
        </div>
      )}
    >
      <div className="flex flex-wrap gap-2">
        {model.marketScopes.map((scope) => (
          <button
            key={scope}
            type="button"
            onClick={() => model.setSelectedMarketScope(scope)}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${model.selectedScope === scope ? "border-[var(--primary)]/40 bg-[rgba(56,189,248,0.12)] text-[var(--primary)]" : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"}`}
          >
            {MARKET_SCOPE_LABEL_ZH_[scope as DaaMarketIndicatorScope] || scope}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DeepLedgerMiniStat label="当前风格" value={marketRegimeLabel(model.selectedScopeContext?.regime)} hint={`普通买入 ${Math.round((model.selectedScopeContext?.buyScale || 0) * 100)}%`} tone={marketRegimeTone(model.selectedScopeContext?.regime)} />
        <DeepLedgerMiniStat label="高波买入" value={`${Math.round((model.selectedScopeContext?.highRiskBuyScale || 0) * 100)}%`} hint={model.selectedScopeContext?.label || "当前范围"} tone="amber" />
        <DeepLedgerMiniStat label="市场事实" value={String(model.bootstrap?.marketContext?.reasons.length || 0)} hint="本轮状态依据条数" tone="cyan" />
        <DeepLedgerMiniStat label="行情新鲜度" value={`${freshnessPct}%`} hint={`过期 ${model.bootstrap?.marketDataHealth?.staleCount || 0} · 缺失 ${model.bootstrap?.marketDataHealth?.missingCount || 0}`} tone={healthTone} />
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[0.86fr_1.14fr]">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
          {indicators.map((item) => (
            <div key={item.key} className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.6)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[var(--text)]">{item.label}</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">{item.reason || item.key}</div>
                </div>
                <DeepLedgerStatusPill tone={marketRegimeTone(model.selectedScopeContext?.regime)}>{formatIndicatorValue(item.rawValue, item.unit)}</DeepLedgerStatusPill>
              </div>
              <div className="mt-3 text-xs text-[var(--muted)]">{marketPercentileText(item.percentile252)}</div>
            </div>
          ))}
        </div>

        <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.6)] p-4">
          {model.marketHistoryError ? (
            <DashboardErrorNotice
              title="市场历史加载失败"
              description={model.marketHistoryError}
              className="rounded-[14px]"
            />
          ) : model.marketHistoryLoading ? (
            <div className="py-14 text-center text-sm text-[var(--faint)]">市场历史加载中...</div>
          ) : model.marketHistoryData.length === 0 ? (
            <DashboardEmptyState
              title="暂无市场历史"
              description="当前范围还没有足够的指标历史，可先刷新市场状态或稍后再看。"
              className="border-0 bg-transparent px-0 py-10"
            />
          ) : (
            <OverviewChartFrame height={280}>
              {({ width, height }) => (
                <LineChart width={width} height={height} data={model.marketHistoryData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#94A3B8", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                  <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 16 }} />
                  {model.selectedScopeKeys.map((key) => {
                    const meta = MARKET_INDICATOR_LINE_META_[key];
                    return <Line key={key} type="monotone" dataKey={key} dot={false} stroke={meta?.color || "#38BDF8"} strokeWidth={2} name={meta?.label || key} />;
                  })}
                </LineChart>
              )}
            </OverviewChartFrame>
          )}
        </div>
      </div>
    </DeepLedgerPanel>
  );
}

export function OverviewAlertsPanel({ model }: { model: PortfolioOverviewModel }) {
  const alerts = model.bootstrap?.overviewAlerts || [];
  return (
    <DeepLedgerPanel accent="amber" title="关键提醒" subtitle="优先展示需要你立即关注的异常、风险和待处理事项。">
      <div className="grid gap-3 md:grid-cols-2">
        {alerts.length > 0 ? alerts.map((alert) => (
          <div key={alert.id} className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.6)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[var(--text)]">{alert.text}</div>
                <div className="mt-1 text-xs text-[var(--muted)]">{alert.kind} · {alert.createdAt.slice(0, 16).replace("T", " ")}</div>
              </div>
              <DeepLedgerStatusPill tone={alertTone(alert.level)}>{alert.level}</DeepLedgerStatusPill>
            </div>
          </div>
        )) : (
          <div className="rounded-[16px] border border-dashed border-[var(--border-strong)] px-5 py-8 text-sm text-[var(--faint)]">
            当前没有高优先级提醒。
          </div>
        )}
      </div>
    </DeepLedgerPanel>
  );
}

export function OverviewEquityTrendPanel({ model }: { model: PortfolioOverviewModel }) {
  return (
    <DeepLedgerPanel accent="green" title="权益趋势" subtitle="最近 90 个快照的总权益、持仓价值和现金变化。">
      {model.trendData.length > 0 ? (
        <OverviewChartFrame height={300}>
          {({ width, height }) => (
            <AreaChart width={width} height={height} data={model.trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="equity-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#38BDF8" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
              <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 16 }} />
              <Area type="monotone" dataKey="totalEquity" stroke="#38BDF8" fill="url(#equity-gradient)" strokeWidth={2} name="总权益" />
              <Line type="monotone" dataKey="holdings" stroke="#818CF8" dot={false} strokeWidth={1.8} name="持仓" />
              <Line type="monotone" dataKey="cash" stroke="#F6AD55" dot={false} strokeWidth={1.8} name="现金" />
            </AreaChart>
          )}
        </OverviewChartFrame>
      ) : (
        <DashboardEmptyState
          title="暂无权益趋势"
          description="系统还没有足够的权益快照，可先完成资金变动或等待下一次快照写入。"
          className="border-0 bg-transparent px-0 py-10"
        />
      )}
    </DeepLedgerPanel>
  );
}

export function OverviewAllocationPanel({ model }: { model: PortfolioOverviewModel }) {
  return (
    <DeepLedgerPanel accent="cyan" title="资产分布" subtitle="只展示持仓前五大 + 其他 + 现金，帮助快速看集中度。">
      {model.allocationData.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <OverviewChartFrame height={260}>
            {({ width, height }) => (
              <PieChart width={width} height={height}>
                <Pie data={model.allocationData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={56} outerRadius={96} paddingAngle={3}>
                  {model.allocationData.map((entry, index) => <Cell key={`${entry.name}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 16 }} />
              </PieChart>
            )}
          </OverviewChartFrame>
          <div className="space-y-3">
            {model.allocationData.map((row, index) => {
              const pct = model.allocationTotal > 0 ? (Number(row.value || 0) / model.allocationTotal) * 100 : 0;
              return (
                <div key={row.name} className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.58)] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} />
                      <span className="text-sm text-[var(--text)]">{row.name}</span>
                    </div>
                    <div className="text-sm font-semibold text-[var(--text)]">{pct.toFixed(1)}%</div>
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted)]">{formatCurrency(Number(row.value || 0), model.baseCurrency)}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <DashboardEmptyState
          title="暂无资产分布"
          description="当前还没有可展示的持仓或现金分布，完成入金或同步持仓后会自动更新。"
          className="border-0 bg-transparent px-0 py-10"
        />
      )}
    </DeepLedgerPanel>
  );
}

export function OverviewCashLedgerPanel({ model }: { model: PortfolioOverviewModel }) {
  return (
    <DeepLedgerPanel
      accent="indigo"
      title="现金流水"
      subtitle="查看最近资金进出与备注，确认账户现金变化是否符合预期。"
      action={(
        <Link href="/daa/dashboard/workbench?tab=cash" className="inline-flex items-center rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition-colors hover:border-[var(--primary)]/40 hover:text-[var(--text)]">
          去工作台记录
        </Link>
      )}
      bodyClassName="pt-0"
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-[var(--border)]">
              <TableHead>时间</TableHead>
              <TableHead>方向</TableHead>
              <TableHead>金额</TableHead>
              <TableHead>备注</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {model.cashLedger.map((row) => {
              const side = row.side === "withdraw" ? "出金" : "入金";
              const amount = row.amountInAccountBase ?? row.amount;
              const tags = formatCashMeta(row);
              return (
                <TableRow key={row.id} className="border-[var(--border)]">
                  <TableCell className="text-sm text-[var(--text)]">{(row.ts || row.createdAt || "").slice(0, 16).replace("T", " ")}</TableCell>
                  <TableCell>
                    <DeepLedgerStatusPill tone={row.side === "withdraw" ? "amber" : "green"}>{side}</DeepLedgerStatusPill>
                  </TableCell>
                  <TableCell className="text-sm text-[var(--text)]">
                    <div>{formatCurrency(amount, row.baseCurrency || model.baseCurrency)}</div>
                    {row.amountInAccountBase != null && row.baseCurrency !== row.accountBaseCurrency ? (
                      <div className="mt-1 text-xs text-[var(--muted)]">原币 {formatCurrency(row.amount, row.baseCurrency || model.baseCurrency)}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm text-[var(--muted)]">
                    <div>{row.note || (row.entryKind === "trade_execution" ? "成交自动入账" : "-")}</div>
                    {tags.length > 0 ? <div className="mt-1 text-xs text-[var(--faint)]">{tags.join(" · ")}</div> : null}
                  </TableCell>
                </TableRow>
              );
            })}
            {model.cashLedger.length === 0 ? (
              <TableRow className="border-[var(--border)]">
                <TableCell colSpan={4} className="py-12 text-center text-sm text-[var(--faint)]">还没有资金流水记录</TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </DeepLedgerPanel>
  );
}

export function OverviewErrorState({ error }: { error: string }) {
  return <DashboardErrorNotice title="总览数据加载失败" description={error} />;
}
