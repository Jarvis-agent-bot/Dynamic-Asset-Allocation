"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, Play, Save, Sparkles } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_ANALYSIS_FOCUS_V1 } from "@/src/daa/llm/analysisFocusDefaultsV1";
import { runUnifiedRebalanceV1 } from "@/src/daa/modules/execution/executionApiV1";
import type { UnifiedDecisionResultV2 } from "@/src/daa/modules/execution/executionTypesV1";

import { DaaExecutionSection } from "../_components/DaaExecutionSection";
import { DaaRiskAuditSection } from "../_components/DaaRiskAuditSection";
import { formatCurrency } from "../_components/daaFormatters";
import {
  buildUnifiedRequest,
  useAnalysts,
  useAssetViews,
  useLastRunResult,
  usePositions,
  useStrategyConfig,
} from "../_components/useDaaStore";

const DAA_DASHBOARD_REFRESH_EVENT_V1 = "daa:dashboard:refresh";

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

function parseDecisionResult(payload: unknown): UnifiedDecisionResultV2 | null {
  const value = payload as any;
  if (!value || typeof value !== "object") return null;
  if (value.schemaVersion !== 2) return null;
  if (!value.plan || !value.opportunityPanel || !value.hydrationDiagnostics || !value.llmAnalysis) return null;
  return value as UnifiedDecisionResultV2;
}

function downloadJsonFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ConsolePage() {
  const [positions] = usePositions();
  const [analysts] = useAnalysts();
  const [assetViews] = useAssetViews();
  const [config] = useStrategyConfig();
  const [lastRun, setLastRun] = useLastRunResult();

  const [requestText, setRequestText] = useState("");
  const [responseText, setResponseText] = useState("");
  const [analysisFocus, setAnalysisFocus] = useState(DEFAULT_ANALYSIS_FOCUS_V1);
  const [running, setRunning] = useState<"idle" | "preview" | "persist">("idle");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const requestFromState = useMemo(() => {
    return buildUnifiedRequest(
      positions ?? [],
      analysts ?? [],
      assetViews ?? [],
      config,
    );
  }, [positions, analysts, assetViews, config]);

  useEffect(() => {
    if (!requestText.trim()) {
      setRequestText(pretty(requestFromState));
    }
  }, [requestFromState, requestText]);

  const parsedLastRun = useMemo(() => parseDecisionResult(lastRun), [lastRun]);

  useEffect(() => {
    if (parsedLastRun && !responseText.trim()) {
      setResponseText(pretty(parsedLastRun));
    }
  }, [parsedLastRun, responseText]);

  async function handleRun(persist: boolean) {
    if (running !== "idle") return;
    setError("");
    setSuccess("");

    if (!analysisFocus.trim()) {
      setError("analysisFocus 不能为空。");
      return;
    }

    let requestPayload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(requestText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("请求 JSON 顶层必须是对象。");
      }
      requestPayload = parsed as Record<string, unknown>;
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求 JSON 解析失败。");
      return;
    }

    setRunning(persist ? "persist" : "preview");
    try {
      const result = await runUnifiedRebalanceV1(requestPayload, {
        persist,
        analysisFocus: analysisFocus.trim(),
      });
      setLastRun(result as unknown);
      setResponseText(pretty(result));
      setSuccess(persist ? "已完成落库运行。" : "已完成预览运行。");
      window.dispatchEvent(new CustomEvent(DAA_DASHBOARD_REFRESH_EVENT_V1, { detail: { ts: Date.now() } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning("idle");
    }
  }

  const summary = parsedLastRun?.plan.summary ?? null;
  const opportunities = parsedLastRun?.opportunityPanel?.opportunities ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="决策台" description="统一入口：运行决策、维护请求/响应输出框、查看 AI 结论。" />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>运行失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {success ? (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">DecisionJsonIOPanel</CardTitle>
            <CardDescription>请求输入框 + 响应输出框（schemaVersion=2）。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">请求 JSON</div>
              <Textarea
                className="min-h-[220px] font-mono text-xs"
                value={requestText}
                onChange={(e) => setRequestText(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">响应 JSON</div>
              <Textarea className="min-h-[220px] font-mono text-xs" value={responseText} readOnly />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setRequestText(pretty(requestFromState))}>
                从当前状态填充
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(requestText)}>
                复制请求
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadJsonFile("daa-console-request.json", requestText)}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                下载请求
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(responseText)} disabled={!responseText.trim()}>
                复制响应
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadJsonFile("daa-console-response.json", responseText)}
                disabled={!responseText.trim()}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                下载响应
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">DecisionAiPanel</CardTitle>
              <CardDescription>analysisFocus 输入 + LLM 结论输出。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">analysisFocus</div>
                <Input value={analysisFocus} onChange={(e) => setAnalysisFocus(e.target.value)} />
              </div>
              <div className="rounded-md border p-2 text-xs text-muted-foreground">
                <div className="mb-1 flex items-center gap-1 text-foreground"><Sparkles className="h-3.5 w-3.5" /> LLM Summary</div>
                <div>{parsedLastRun?.llmAnalysis?.summary || "暂无输出"}</div>
              </div>
              {parsedLastRun?.llmAnalysis?.opportunityNotes?.length ? (
                <div className="rounded-md border p-2 text-xs">
                  <div className="mb-1 font-medium">机会提示</div>
                  {parsedLastRun.llmAnalysis.opportunityNotes.slice(0, 4).map((line, idx) => (
                    <div key={`opp-note-${idx}`}>- {line}</div>
                  ))}
                </div>
              ) : null}
              {parsedLastRun?.llmAnalysis?.riskNotes?.length ? (
                <div className="rounded-md border p-2 text-xs">
                  <div className="mb-1 font-medium">风险提示</div>
                  {parsedLastRun.llmAnalysis.riskNotes.slice(0, 4).map((line, idx) => (
                    <div key={`risk-note-${idx}`}>- {line}</div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">DecisionRunPanel</CardTitle>
              <CardDescription>预览运行或落库运行。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void handleRun(false)} disabled={running !== "idle"}>
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  {running === "preview" ? "预览运行中..." : "预览运行"}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void handleRun(true)} disabled={running !== "idle"}>
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  {running === "persist" ? "落库运行中..." : "落库运行"}
                </Button>
              </div>
              <div className="rounded-md border p-2 text-xs text-muted-foreground">
                当前响应结构：`schemaVersion=2`，已移除旧兼容分支。
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {summary ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">最新运行摘要</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-xs md:grid-cols-4">
            <div className="rounded border p-2">是否触发：{summary.shouldRebalance ? "是" : "否"}</div>
            <div className="rounded border p-2">权益：{formatCurrency(summary.totalEquity || 0, summary.baseCurrency || "USD")}</div>
            <div className="rounded border p-2">可执行：{summary.executableOrderCount || 0}</div>
            <div className="rounded border p-2">阻断：{summary.blockedOrderCount || 0}</div>
          </CardContent>
        </Card>
      ) : null}

      {opportunities.length ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">机会池（Top 12）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[320px] overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>代码</TableHead>
                    <TableHead className="text-right">机会分</TableHead>
                    <TableHead className="text-right">置信度</TableHead>
                    <TableHead>动作</TableHead>
                    <TableHead>原因</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opportunities.slice(0, 12).map((item) => (
                    <TableRow key={item.symbol}>
                      <TableCell className="font-medium">{item.symbol}</TableCell>
                      <TableCell className="text-right">{item.finalScorePct.toFixed(1)}</TableCell>
                      <TableCell className="text-right">{item.confidencePct.toFixed(1)}%</TableCell>
                      <TableCell>
                        {item.action === "open_or_add" ? "开/加仓" : item.action === "watch" ? "观察" : "减仓/回避"}
                      </TableCell>
                      <TableCell className="max-w-[380px] text-xs text-muted-foreground">{item.reasons.slice(0, 2).join("；") || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">DecisionExecutionPanel</CardTitle>
          <CardDescription>复用执行回填模块。</CardDescription>
        </CardHeader>
        <CardContent>
          <DaaExecutionSection />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">DecisionRiskPanel</CardTitle>
          <CardDescription>复用风控审计模块。</CardDescription>
        </CardHeader>
        <CardContent>
          <DaaRiskAuditSection />
        </CardContent>
      </Card>
    </div>
  );
}
