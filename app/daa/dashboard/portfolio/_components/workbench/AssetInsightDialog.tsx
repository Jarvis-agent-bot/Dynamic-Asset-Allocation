"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { WorkbenchAssetInsightResponseV1 } from "@/src/daa/modules/workbench/workbenchTypesV1";

export default function AssetInsightDialog(props: {
  open: boolean;
  loading?: boolean;
  symbol?: string;
  data: WorkbenchAssetInsightResponseV1 | null;
  onOpenChange: (open: boolean) => void;
}) {
  const newsItems = props.data?.news?.items || [];
  const technicalCommon = props.data?.technical?.common || [];
  const technicalSpecific = props.data?.technical?.specific || [];

  const chipClass = "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]";

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>资产洞察 {props.symbol ? `· ${props.symbol}` : ""}</DialogTitle>
          <DialogDescription>查看新闻、技术指标、风险提示与大模型分析摘要。</DialogDescription>
        </DialogHeader>

        {props.loading ? (
          <div className="text-sm text-muted-foreground">加载洞察中...</div>
        ) : null}

        {!props.loading && !props.data ? (
          <div className="text-sm text-muted-foreground">暂无可用洞察。</div>
        ) : null}

        {props.data ? (
          <div className="space-y-4">
            <section className="rounded-md border p-3 text-sm">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={chipClass}>{props.data.opportunity?.actionLabelZh || "观察"}</span>
                <span className={`${chipClass} text-muted-foreground`}>综合评分 {props.data.opportunity?.finalScorePct?.toFixed(1) ?? "-"}</span>
                <span className={`${chipClass} text-muted-foreground`}>置信度 {props.data.opportunity?.confidencePct?.toFixed(1) ?? "-"}</span>
                <span className={`${chipClass} text-muted-foreground`}>风险得分 {props.data.opportunity?.riskScorePct?.toFixed(1) ?? "-"}</span>
              </div>
              <div className="text-xs text-muted-foreground">机会解读：{props.data.opportunity?.reasonZh || "-"}</div>
              <div className="mt-1 text-xs text-muted-foreground">风险解读：{props.data.opportunity?.riskZh || "-"}</div>
            </section>

            <section className="rounded-md border p-3 text-sm">
              <div className="mb-2 font-medium">风险提示</div>
              {props.data.riskHints.length ? (
                <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  {props.data.riskHints.map((item, idx) => (
                    <li key={`risk-${idx}`}>{item}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-muted-foreground">当前无额外风险提示。</div>
              )}
            </section>

            <section className="rounded-md border p-3 text-sm">
              <div className="mb-2 font-medium">技术指标（通用）</div>
              {technicalCommon.length ? (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead>指标</TableHead>
                        <TableHead>数值</TableHead>
                        <TableHead>说明</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {technicalCommon.map((item) => (
                        <TableRow key={`tc-${item.key}`}>
                          <TableCell>{item.label}</TableCell>
                          <TableCell className="font-mono text-xs">{String(item.value)}{item.unit || ""}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{item.description || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">暂无技术信号。</div>
              )}
            </section>

            <section className="rounded-md border p-3 text-sm">
              <div className="mb-2 font-medium">技术指标（资产特化）</div>
              {technicalSpecific.length ? (
                <div className="space-y-2">
                  {technicalSpecific.map((item) => (
                    <div key={`ts-${item.key}`} className="rounded-md border p-2 text-xs">
                      <div className="font-medium">{item.label}</div>
                      <div className="text-muted-foreground">数值：{String(item.value)}{item.unit || ""}</div>
                      <div className="text-muted-foreground">{item.description || "-"}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">暂无资产特化指标。</div>
              )}
            </section>

            <section className="rounded-md border p-3 text-sm">
              <div className="mb-2 font-medium">新闻与 AI 解读</div>
              {props.data.news?.aiSummary ? (
                <div className="mb-3 space-y-1 rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
                  <div>摘要：{props.data.news.aiSummary.summary || "-"}</div>
                  <div>驱动：{props.data.news.aiSummary.drivers.join("；") || "-"}</div>
                  <div>利多：{props.data.news.aiSummary.bullish.join("；") || "-"}</div>
                  <div>利空：{props.data.news.aiSummary.bearish.join("；") || "-"}</div>
                  <div>不确定性：{props.data.news.aiSummary.uncertainties.join("；") || "-"}</div>
                  <div>可执行建议：{props.data.news.aiSummary.actions.join("；") || "-"}</div>
                </div>
              ) : null}

              {newsItems.length ? (
                <div className="space-y-2">
                  {newsItems.map((item, idx) => (
                    <a
                      key={`news-${idx}`}
                      href={item.link}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-md border p-2 text-xs hover:bg-muted/40"
                    >
                      <div className="font-medium text-foreground">{item.title}</div>
                      <div className="mt-1 text-muted-foreground">{new Date(item.ts).toLocaleString()}</div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">暂无新闻数据。</div>
              )}
            </section>

            <section className="rounded-md border p-3 text-sm">
              <div className="mb-2 font-medium">大模型分析</div>
              {props.data.llmAnalysis ? (
                <div className="space-y-2 text-xs">
                  <div className="text-muted-foreground">{String((props.data.llmAnalysis as any).summary || "-")}</div>
                  <div className="text-muted-foreground">机会：{Array.isArray((props.data.llmAnalysis as any).opportunityNotes) ? (props.data.llmAnalysis as any).opportunityNotes.join("；") : "-"}</div>
                  <div className="text-muted-foreground">风险：{Array.isArray((props.data.llmAnalysis as any).riskNotes) ? (props.data.llmAnalysis as any).riskNotes.join("；") : "-"}</div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">未开启或未返回 LLM 分析。</div>
              )}
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
