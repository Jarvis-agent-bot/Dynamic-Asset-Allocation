"use client";

import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DaaSurfaceStatusPill } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { getWorkbenchAssetInsights } from "@/src/daa/modules/workbench/workbenchApi";
import type { WorkbenchAssetInsightResponse } from "@/src/daa/modules/workbench/workbenchTypes";

/* ------------------------------------------------------------------ */
/*  信号维度元数据                                                      */
/* ------------------------------------------------------------------ */

const SIGNAL_META = [
  { key: "human" as const, label: "人因", weight: 0.35, color: "hsl(188 95% 60%)", bgClass: "bg-cyan-500/12 border-cyan-500/20 text-cyan-300" },
  { key: "technical" as const, label: "技术", weight: 0.25, color: "hsl(239 84% 67%)", bgClass: "bg-indigo-500/12 border-indigo-500/20 text-indigo-300" },
  { key: "news" as const, label: "新闻", weight: 0.20, color: "hsl(45 93% 47%)", bgClass: "bg-amber-500/12 border-amber-500/20 text-amber-300" },
  { key: "valuation" as const, label: "估值", weight: 0.20, color: "hsl(142 71% 45%)", bgClass: "bg-emerald-500/12 border-emerald-500/20 text-emerald-300" },
];

function actionMeta(score: number, confidence: number): { label: string; tone: "green" | "amber" | "red" } {
  if (score >= 72 && confidence >= 58) return { label: "建仓/加仓", tone: "green" };
  if (score >= 56 && confidence >= 42) return { label: "观察", tone: "amber" };
  return { label: "减仓/回避", tone: "red" };
}

function scoreOpacity(score: number): number {
  return 0.3 + (score / 100) * 0.7;
}

/* ------------------------------------------------------------------ */
/*  Hover 详情生成                                                     */
/* ------------------------------------------------------------------ */

function buildHumanTooltip(insight: WorkbenchAssetInsightResponse): string {
  const score = insight.opportunity?.scores?.human;
  if (score == null) return "暂无人因信号数据";
  const parts: string[] = [`评分 ${score.toFixed(0)}`];
  const reasons = insight.opportunity?.reasons?.filter((r) => r.includes("人因")) ?? [];
  if (reasons.length) parts.push(reasons[0]);
  return parts.join("，") || `评分 ${score.toFixed(0)}`;
}

function buildTechnicalTooltip(insight: WorkbenchAssetInsightResponse): string {
  if (!insight.technical) return "暂无技术信号数据";
  const parts: string[] = [`评分 ${insight.technical.scorePct.toFixed(0)}`];
  const regime = insight.technical.momentumRegime;
  if (regime === "strong") parts.push("趋势偏强");
  else if (regime === "weak") parts.push("趋势偏弱");
  else parts.push("趋势中性");
  const rsi = insight.technical.common?.find((m) => m.key === "rsi14");
  if (rsi) parts.push(`RSI ${Number(rsi.value).toFixed(0)}`);
  const macd = insight.technical.common?.find((m) => m.key === "macdHist");
  if (macd) {
    const v = Number(macd.value);
    parts.push(`MACD ${v > 0 ? "偏多" : v < 0 ? "偏空" : "中性"}`);
  }
  return parts.join("，");
}

function buildNewsTooltip(insight: WorkbenchAssetInsightResponse): string {
  if (!insight.news) return "暂无新闻信号数据";
  const parts: string[] = [`评分 ${insight.news.scorePct.toFixed(0)}`];
  parts.push(`${insight.news.evidenceCount} 条新闻`);
  if (insight.news.aiSummary?.summary) {
    const summary = insight.news.aiSummary.summary;
    parts.push(summary.length > 40 ? summary.slice(0, 40) + "…" : summary);
  }
  return parts.join("，");
}

function buildValuationTooltip(insight: WorkbenchAssetInsightResponse): string {
  if (!insight.valuation) return "暂无估值信号数据";
  const parts: string[] = [`评分 ${insight.valuation.scorePct.toFixed(0)}`];
  const temp = insight.valuation.temperature;
  if (temp === "cheap") parts.push("偏便宜");
  else if (temp === "expensive") parts.push("偏贵");
  else parts.push("中性");
  const pct90 = insight.valuation.common?.find((m) => m.key === "percentile90");
  if (pct90) parts.push(`90天百分位 ${Number(pct90.value).toFixed(0)}%`);
  return parts.join("，");
}

const TOOLTIP_BUILDERS: Record<string, (i: WorkbenchAssetInsightResponse) => string> = {
  human: buildHumanTooltip,
  technical: buildTechnicalTooltip,
  news: buildNewsTooltip,
  valuation: buildValuationTooltip,
};

/* ------------------------------------------------------------------ */
/*  圆环图组件                                                         */
/* ------------------------------------------------------------------ */

function ScoreDonut(props: {
  scores: { human: number; news: number; technical: number; valuation: number };
  finalScore: number;
}) {
  const { scores, finalScore } = props;
  const meta = actionMeta(finalScore, 60);

  const data = SIGNAL_META.map((s) => ({
    name: s.label,
    value: s.weight * 100,
    score: scores[s.key],
    color: s.color,
  }));

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-[100px] w-[100px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={32}
              outerRadius={46}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((entry, i) => (
                <Cell
                  key={entry.name}
                  fill={entry.color}
                  fillOpacity={scoreOpacity(entry.score)}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* 中心评分 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn(
            "font-[var(--font-mono)] text-[22px] font-bold leading-none",
            meta.tone === "green" ? "text-emerald-400" : meta.tone === "amber" ? "text-amber-400" : "text-red-400",
          )}>
            {finalScore.toFixed(0)}
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        <DaaSurfaceStatusPill tone={meta.tone}>{meta.label}</DaaSurfaceStatusPill>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  主组件                                                             */
/* ------------------------------------------------------------------ */

export function SignalDashboard(props: { assetKey: string }) {
  const [insight, setInsight] = useState<WorkbenchAssetInsightResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!props.assetKey) return;
    setLoading(true);
    setError("");
    getWorkbenchAssetInsights(props.assetKey, { includeLlm: false })
      .then(setInsight)
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [props.assetKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-[16px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)] px-4 py-6">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--muted)]" />
        <span className="text-xs text-[var(--muted)]">加载信号数据…</span>
      </div>
    );
  }

  if (error || !insight?.opportunity?.scores) {
    return (
      <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)] px-4 py-4 text-center text-xs text-[var(--muted)]">
        {error || "暂无信号评分数据"}
      </div>
    );
  }

  const { scores } = insight.opportunity;
  const finalScore = insight.opportunity.finalScorePct;
  const confidence = insight.opportunity.confidencePct;
  const penalty = scores.penalty;

  return (
    <div className="space-y-3 rounded-[16px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">
        信号仪表盘
      </div>

      {/* 圆环图 + 操作建议 */}
      <ScoreDonut scores={scores} finalScore={finalScore} />

      {/* 置信度 */}
      <div className="flex items-center justify-between text-xs text-[var(--muted)]">
        <span>置信度</span>
        <span className="font-[var(--font-mono)]">{confidence.toFixed(0)}%</span>
      </div>

      {/* 四维色块 + Hover */}
      <TooltipProvider delayDuration={200}>
        <div className="grid grid-cols-2 gap-2">
          {SIGNAL_META.map((s) => {
            const score = scores[s.key];
            const tooltipText = TOOLTIP_BUILDERS[s.key]?.(insight) ?? "";
            return (
              <Tooltip key={s.key}>
                <TooltipTrigger asChild>
                  <div className={cn(
                    "flex cursor-default items-center justify-between rounded-[10px] border px-3 py-2 text-xs transition-colors",
                    s.bgClass,
                  )}>
                    <span className="font-medium">{s.label}</span>
                    <span className="font-[var(--font-mono)] font-semibold">{score.toFixed(0)}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="max-w-[260px] rounded-[10px] border border-[var(--border)] bg-[rgba(13,19,32,0.96)] px-3 py-2 text-xs leading-5 text-[var(--text)]"
                >
                  {tooltipText}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      {/* 冲突提示 */}
      {penalty > 0 ? (
        <div className="flex items-center gap-2 rounded-[10px] border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-xs text-amber-300">
          <span>&#9888;</span>
          <span>信号冲突 (-{penalty.toFixed(0)})</span>
        </div>
      ) : null}
    </div>
  );
}
