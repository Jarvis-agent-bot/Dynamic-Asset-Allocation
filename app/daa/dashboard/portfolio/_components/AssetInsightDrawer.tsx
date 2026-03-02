"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import { fetchAssetInsightsV1 } from "@/app/daa/dashboard/_components/assetInsightsClient";
import type { DaaAssetInsightRowV1 } from "@/src/daa/insights/assetInsightsV1";

function actionLabel(action: string): string {
  if (action === "open_or_add") return "开/加仓";
  if (action === "reduce_or_avoid") return "减仓/回避";
  return "观察";
}

function toFixed(value: number | null | undefined, digits = 2): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toFixed(digits);
}

function toDateLabel(value: string | null | undefined): string {
  const text = String(value || "").trim();
  if (!text) return "-";
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return text;
  return new Date(ms).toLocaleString();
}

function toRecentNewsRows(row: DaaAssetInsightRowV1 | null): Array<NonNullable<DaaAssetInsightRowV1["news"]>["items"][number]> {
  const items = row?.news?.items ?? [];
  const floor = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    const ms = Date.parse(String(item.ts || ""));
    return Number.isFinite(ms) && ms >= floor;
  }).slice(0, 7);
}

type Props = {
  open: boolean;
  symbol: string;
  analysisFocus: string;
  onOpenChange: (open: boolean) => void;
};

export default function AssetInsightDrawer({ open, symbol, analysisFocus, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [row, setRow] = useState<DaaAssetInsightRowV1 | null>(null);

  useEffect(() => {
    if (!open) return;
    const normalized = String(symbol || "").trim().toUpperCase();
    if (!normalized) return;

    let cancelled = false;
    setLoading(true);
    setError("");

    void fetchAssetInsightsV1({
      symbols: [normalized],
      detailMode: "full",
      analysisFocus,
      includeLlm: true,
      fundOpsLimit: 5,
    }).then((response) => {
      if (cancelled) return;
      setRow(response.insights[0] ?? null);
    }).catch((err) => {
      if (cancelled) return;
      setRow(null);
      setError(err instanceof Error ? err.message : String(err));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [analysisFocus, open, symbol]);

  const recentNews = useMemo(() => toRecentNewsRows(row), [row]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{symbol || "-"} · 证据洞察</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : null}

        {!loading && error ? (
          <Alert variant="destructive">
            <AlertTitle>洞察加载失败</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {!loading && !error && row ? (
          <div className="space-y-4 text-sm">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded border p-2">
                <div className="text-xs text-muted-foreground">机会评分</div>
                <div className="text-base font-semibold">{toFixed(row.lite.finalScorePct, 1)}</div>
              </div>
              <div className="rounded border p-2">
                <div className="text-xs text-muted-foreground">置信度</div>
                <div className="text-base font-semibold">{toFixed(row.lite.confidencePct, 1)}%</div>
              </div>
              <div className="rounded border p-2">
                <div className="text-xs text-muted-foreground">风险分</div>
                <div className="text-base font-semibold">{toFixed(row.lite.riskScorePct, 1)}</div>
              </div>
              <div className="rounded border p-2">
                <div className="text-xs text-muted-foreground">动作</div>
                <div className="text-base font-semibold">{actionLabel(row.lite.action)}</div>
              </div>
            </div>

            <div className="rounded border p-3">
              <div className="mb-2 text-sm font-medium">技术指标</div>
              {row.technical ? (
                <div className="grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded border px-2 py-1.5">趋势：{row.technical.momentumRegime}</div>
                  <div className="rounded border px-2 py-1.5">close：{toFixed(row.technical.metrics.close, 3)}</div>
                  <div className="rounded border px-2 py-1.5">SMA20：{toFixed(row.technical.metrics.sma20, 3)}</div>
                  <div className="rounded border px-2 py-1.5">SMA60：{toFixed(row.technical.metrics.sma60, 3)}</div>
                  <div className="rounded border px-2 py-1.5">RSI14：{toFixed(row.technical.metrics.rsi14, 2)}</div>
                  <div className="rounded border px-2 py-1.5">20日收益：{formatPercent(row.technical.metrics.return20Pct, 1)}</div>
                  <div className="rounded border px-2 py-1.5">年化波动：{toFixed(row.technical.metrics.annualizedVolPct, 1)}%</div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">暂无技术指标。</div>
              )}
            </div>

            <div className="rounded border p-3">
              <div className="mb-2 text-sm font-medium">近期新闻（最近 7 天）</div>
              {recentNews.length ? (
                <div className="space-y-2">
                  {recentNews.map((item, index) => (
                    <div key={`${item.ts}-${index}`} className="rounded border p-2">
                      <div className="text-xs text-muted-foreground">{toDateLabel(item.ts)}</div>
                      <div className="text-sm font-medium">{item.title || "-"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        情绪 {toFixed(item.sentimentScore, 2)} · 新鲜度 {toFixed(item.freshness, 2)} · 可信度 {toFixed(item.sourceCredibility, 2)}
                      </div>
                      {item.link ? (
                        <a className="mt-1 inline-block text-xs text-primary underline" href={item.link} target="_blank" rel="noreferrer">
                          查看原文
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">最近 7 天暂无可用新闻证据。</div>
              )}
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded border p-3">
                <div className="mb-2 text-sm font-medium">基金经理操作 · Top5 加仓</div>
                {(row.fundManagerOps?.topAdds?.length ?? 0) > 0 ? (
                  <div className="max-h-64 overflow-auto rounded border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>基金</TableHead>
                          <TableHead className="text-right">Δ权重</TableHead>
                          <TableHead>披露日</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {row.fundManagerOps!.topAdds.map((item, index) => (
                          <TableRow key={`${item.fundCode}-add-${index}`}>
                            <TableCell>
                              <div className="font-medium">{item.fundName}</div>
                              <div className="text-xs text-muted-foreground">{item.fundCode}</div>
                              {item.sourceRef ? (
                                <a
                                  className="text-xs text-primary underline"
                                  href={item.sourceRef}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  来源链接
                                </a>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right text-emerald-600">+{toFixed(item.deltaWeightPct, 2)}%</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{toDateLabel(item.disclosedAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">暂无加仓明细。</div>
                )}
              </div>

              <div className="rounded border p-3">
                <div className="mb-2 text-sm font-medium">基金经理操作 · Top5 减仓</div>
                {(row.fundManagerOps?.topReduces?.length ?? 0) > 0 ? (
                  <div className="max-h-64 overflow-auto rounded border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>基金</TableHead>
                          <TableHead className="text-right">Δ权重</TableHead>
                          <TableHead>披露日</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {row.fundManagerOps!.topReduces.map((item, index) => (
                          <TableRow key={`${item.fundCode}-reduce-${index}`}>
                            <TableCell>
                              <div className="font-medium">{item.fundName}</div>
                              <div className="text-xs text-muted-foreground">{item.fundCode}</div>
                              {item.sourceRef ? (
                                <a
                                  className="text-xs text-primary underline"
                                  href={item.sourceRef}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  来源链接
                                </a>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right text-red-600">{toFixed(item.deltaWeightPct, 2)}%</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{toDateLabel(item.disclosedAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">暂无减仓明细。</div>
                )}
              </div>
            </div>

            <div className="rounded border p-3">
              <div className="mb-2 text-sm font-medium">LLM 结论</div>
              {row.llmAnalysis ? (
                <div className="space-y-2 text-xs">
                  <div className="rounded border p-2">{row.llmAnalysis.summary || "暂无总结"}</div>
                  {row.llmAnalysis.opportunityNotes.length ? (
                    <div className="rounded border p-2">
                      <div className="mb-1 font-medium">机会提示</div>
                      {row.llmAnalysis.opportunityNotes.map((item, index) => (
                        <div key={`opp-${index}`}>- {item}</div>
                      ))}
                    </div>
                  ) : null}
                  {row.llmAnalysis.riskNotes.length ? (
                    <div className="rounded border p-2">
                      <div className="mb-1 font-medium">风险提示</div>
                      {row.llmAnalysis.riskNotes.map((item, index) => (
                        <div key={`risk-${index}`}>- {item}</div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">未返回 LLM 结论。</div>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
