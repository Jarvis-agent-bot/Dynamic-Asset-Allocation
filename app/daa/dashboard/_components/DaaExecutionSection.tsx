"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getApiErrorMessageV1 } from "@/src/daa/api/clientV1";
import { applyExecutionEventsV1, listRebalanceDecisionsV1 } from "@/src/daa/modules/execution/executionApiV1";
import type {
  ApplyExecutionEventsResultV1,
  ExecutionEventInputV1,
  ExecutionOrderStatusV1,
  ExecutionOrderV1,
  RebalanceDecisionV1,
} from "@/src/daa/modules/execution/executionTypesV1";
import { formatCurrency } from "../_components/daaFormatters";

type FillDraft = {
  qty: string;
  price: string;
  fee: string;
  note: string;
  final: boolean;
};

type DecisionSnapshotView = {
  baseCurrency: string;
  requestCash: number | null;
  warning: string | null;
};

const DAA_DASHBOARD_REFRESH_EVENT_V1 = "daa:dashboard:refresh";
const DAA_DASHBOARD_DATA_UPDATED_EVENT_V1 = "daa:dashboard:data-updated";

const DECISION_STATUS_PRIORITY: Record<RebalanceDecisionV1["status"], number> = {
  pending: 0,
  partial: 1,
  executed: 2,
  canceled: 3,
  skipped: 4,
};

function toFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeCurrency(value: unknown): string {
  const text = String(value || "").trim().toUpperCase();
  return text || "";
}

function parseDecisionSnapshot(decision: RebalanceDecisionV1 | null): DecisionSnapshotView {
  if (!decision) {
    return {
      baseCurrency: "USD",
      requestCash: null,
      warning: null,
    };
  }

  const warnings: string[] = [];
  const response = asRecord(decision.responseJson);
  const request = asRecord(decision.requestJson);

  let responseBaseCurrency = "";
  if (!response || Number(response.schemaVersion) !== 2) {
    warnings.push("responseJson 不是 schemaVersion=2 的决策快照");
  } else {
    const plan = asRecord(response.plan);
    const summary = asRecord(plan?.summary);
    responseBaseCurrency = normalizeCurrency(summary?.baseCurrency);
    if (!responseBaseCurrency) {
      warnings.push("responseJson.plan.summary.baseCurrency 缺失");
    }
  }

  const account = asRecord(request?.account);
  const requestBaseCurrency = normalizeCurrency(account?.baseCurrency);
  const cash = toFiniteNumber(account?.cash);
  const investableCash = toFiniteNumber(account?.investableCash);
  const requestCash = cash != null && cash >= 0
    ? cash
    : investableCash != null && investableCash >= 0
      ? investableCash
      : null;
  if (requestCash == null) {
    warnings.push("requestJson.account.cash / investableCash 缺失");
  }

  const baseCurrency = responseBaseCurrency || requestBaseCurrency || "USD";
  if (!responseBaseCurrency && !requestBaseCurrency) {
    warnings.push("决策快照中缺少 baseCurrency，已回退 USD");
  }

  return {
    baseCurrency,
    requestCash,
    warning: warnings.length > 0 ? warnings.join("；") : null,
  };
}

function isOrderFinal(status: ExecutionOrderStatusV1): boolean {
  return status === "executed" || status === "canceled" || status === "skipped";
}

function canSubmit(status: ExecutionOrderStatusV1): boolean {
  return status === "pending";
}

function canCancel(status: ExecutionOrderStatusV1): boolean {
  return status === "pending" || status === "submitted" || status === "partial";
}

function canSkip(status: ExecutionOrderStatusV1): boolean {
  return status === "pending" || status === "submitted";
}

function canFill(status: ExecutionOrderStatusV1): boolean {
  return status === "pending" || status === "submitted" || status === "partial";
}

function summarizeEvent(order: ExecutionOrderV1, result: ApplyExecutionEventsResultV1): string {
  const applied = result.applied[0];
  if (!applied) return "事件已提交";
  const fillText = applied.type === "fill"
    ? `，成交 ${applied.fillQty.toFixed(6)}（${applied.fillNotional.toFixed(2)}）`
    : "";
  return `${order.symbol} ${applied.type}：${applied.fromStatus} → ${applied.toStatus}${fillText}`;
}

export function DaaExecutionSection() {
  const [decisions, setDecisions] = useState<RebalanceDecisionV1[]>([]);
  const [selectedDecisionId, setSelectedDecisionId] = useState<string>("");
  const [fillDrafts, setFillDrafts] = useState<Record<string, FillDraft>>({});
  const [latestResult, setLatestResult] = useState<ApplyExecutionEventsResultV1 | null>(null);
  const [loading, setLoading] = useState(false);
  const [submittingKey, setSubmittingKey] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  async function load(preferredDecisionId?: string) {
    setLoading(true);
    setError("");
    try {
      const rows = await listRebalanceDecisionsV1({ limit: 100 });
      const sorted = [...rows].sort((a, b) => {
        if (a.status === b.status) return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return (DECISION_STATUS_PRIORITY[a.status] ?? 99) - (DECISION_STATUS_PRIORITY[b.status] ?? 99);
      });
      setDecisions(sorted);

      const fallbackId = preferredDecisionId || selectedDecisionId;
      const hasFallback = fallbackId && sorted.some((item) => item.id === fallbackId);
      setSelectedDecisionId(hasFallback ? fallbackId : sorted[0]?.id || "");
    } catch (e) {
      setError(getApiErrorMessageV1(e));
    } finally {
      setLoading(false);
      window.dispatchEvent(new CustomEvent(DAA_DASHBOARD_DATA_UPDATED_EVENT_V1, { detail: { ts: Date.now() } }));
    }
  }

  useEffect(() => {
    function onRefresh() {
      void load();
    }
    void load();
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    return () => window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
  }, []);

  const selected = useMemo(
    () => decisions.find((d) => d.id === selectedDecisionId) || null,
    [decisions, selectedDecisionId],
  );
  const snapshotView = useMemo(() => parseDecisionSnapshot(selected), [selected]);
  const selectedBaseCurrency = snapshotView.baseCurrency;
  const requestCash = snapshotView.requestCash;

  const latestAccount = useMemo(() => {
    if (!latestResult || latestResult.decision.id !== selected?.id) return null;
    return latestResult.account;
  }, [latestResult, selected?.id]);

  const orderStats = useMemo(() => {
    const rows = selected?.orders || [];
    let executed = 0;
    let partial = 0;
    let canceled = 0;
    let skipped = 0;

    for (const row of rows) {
      if (row.status === "executed") executed += 1;
      if (row.status === "partial") partial += 1;
      if (row.status === "canceled") canceled += 1;
      if (row.status === "skipped") skipped += 1;
    }

    return {
      total: rows.length,
      executed,
      partial,
      canceled,
      skipped,
    };
  }, [selected]);

  useEffect(() => {
    if (!selected) {
      setFillDrafts({});
      return;
    }

    const next: Record<string, FillDraft> = {};
    for (const order of selected.orders) {
      next[order.orderId] = {
        qty: "",
        price: order.executedPrice > 0 ? String(order.executedPrice) : "",
        fee: "0",
        note: order.notes || "",
        final: false,
      };
    }
    setFillDrafts(next);
  }, [selected?.id]);

  async function applyOrderEvent(order: ExecutionOrderV1, event: Omit<ExecutionEventInputV1, "orderId">) {
    if (!selected) return;

    const actionKey = `${order.orderId}:${event.type}`;
    setSubmittingKey(actionKey);
    setError("");
    setSuccess("");

    try {
      const result = await applyExecutionEventsV1({
        decisionId: selected.id,
        events: [{ orderId: order.orderId, ...event }],
      });
      setLatestResult(result);
      setSuccess(summarizeEvent(order, result));

      if (event.type === "fill") {
        setFillDrafts((prev) => ({
          ...prev,
          [order.orderId]: {
            ...(prev[order.orderId] || { qty: "", price: "", fee: "0", note: "", final: false }),
            qty: "",
            fee: "0",
          },
        }));
      }

      await load(selected.id);
    } catch (e) {
      setError(getApiErrorMessageV1(e));
    } finally {
      setSubmittingKey("");
    }
  }

  async function submitFill(order: ExecutionOrderV1) {
    const draft = fillDrafts[order.orderId];
    const qty = Number(draft?.qty || 0);
    const price = Number(draft?.price || 0);
    const fee = Number(draft?.fee || 0);

    if (!Number.isFinite(qty) || qty <= 0) {
      setError(`请填写 ${order.symbol} 的有效成交数量（> 0）`);
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setError(`请填写 ${order.symbol} 的有效成交价格（> 0）`);
      return;
    }
    if (!Number.isFinite(fee) || fee < 0) {
      setError(`请填写 ${order.symbol} 的有效手续费（>= 0）`);
      return;
    }

    await applyOrderEvent(order, {
      type: "fill",
      fillQty: qty,
      fillPrice: price,
      fee,
      note: String(draft?.note || "").trim() || undefined,
      final: Boolean(draft?.final),
    });
  }

  const busy = submittingKey.length > 0;

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>操作失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {success ? (
        <Alert>
          <AlertTitle>事件已应用</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      {snapshotView.warning ? (
        <Alert variant="destructive">
          <AlertTitle>决策快照异常</AlertTitle>
          <AlertDescription>{snapshotView.warning}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">执行决策</CardTitle>
          <CardDescription>按决策选择订单，逐条提交交易事件。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={selectedDecisionId}
            onChange={(e) => setSelectedDecisionId(e.target.value)}
            disabled={loading || decisions.length === 0}
          >
            {decisions.length === 0 ? <option value="">暂无决策记录</option> : null}
            {decisions.map((decision) => (
              <option key={decision.id} value={decision.id}>
                {new Date(decision.createdAt).toLocaleString()} · {decision.status} · {decision.id}
              </option>
            ))}
          </select>

          <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded border p-2">决策状态：{selected?.status || "-"}</div>
            <div className="rounded border p-2">订单数：{orderStats.total}</div>
            <div className="rounded border p-2">执行中/已成：{orderStats.partial} / {orderStats.executed}</div>
            <div className="rounded border p-2">取消/跳过：{orderStats.canceled} / {orderStats.skipped}</div>
            <div className="rounded border p-2 md:col-span-2 lg:col-span-2">
              现金：
              {latestAccount
                ? `${formatCurrency(latestAccount.cash, latestAccount.baseCurrency)}（事件驱动）`
                : requestCash != null
                  ? `${formatCurrency(requestCash, selectedBaseCurrency)}（来自请求快照）`
                  : "-"}
            </div>
            <div className="rounded border p-2 md:col-span-2 lg:col-span-2">
              最近权益：
              {latestResult && latestResult.decision.id === selected?.id
                ? formatCurrency(latestResult.equitySnapshot.totalEquity, selectedBaseCurrency)
                : "-"}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">订单事件</CardTitle>
          <CardDescription>
            先“提交订单”，再按真实成交逐笔记录 fill；支持中途 cancel / skip。成交会自动写入交易日志并更新资产。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[560px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>代码</TableHead>
                  <TableHead>方向</TableHead>
                  <TableHead className="text-right">建议金额</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">累计成交数量</TableHead>
                  <TableHead className="text-right">累计成交均价</TableHead>
                  <TableHead className="text-right">累计手续费</TableHead>
                  <TableHead className="text-right">已记账金额</TableHead>
                  <TableHead>订单操作</TableHead>
                  <TableHead className="min-w-[300px]">成交录入</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selected?.orders?.map((order) => {
                  const draft = fillDrafts[order.orderId] || { qty: "", price: "", fee: "0", note: "", final: false };
                  const actionPrefix = `${order.orderId}:`;

                  return (
                    <TableRow key={order.orderId}>
                      <TableCell className="font-medium">{order.symbol}</TableCell>
                      <TableCell>{order.side}</TableCell>
                      <TableCell className="text-right">{formatCurrency(order.suggestedNotional, selectedBaseCurrency)}</TableCell>
                      <TableCell>
                        <span className="rounded border px-2 py-0.5 text-xs">{order.status}</span>
                      </TableCell>
                      <TableCell className="text-right">{Number(order.executedQty || 0).toFixed(6)}</TableCell>
                      <TableCell className="text-right">{Number(order.executedPrice || 0).toFixed(4)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(order.fee || 0, selectedBaseCurrency)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(order.bookedNotional || 0, selectedBaseCurrency)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!canSubmit(order.status) || busy}
                            onClick={() => void applyOrderEvent(order, { type: "submit", note: draft.note.trim() || undefined })}
                          >
                            {submittingKey === `${actionPrefix}submit` ? "提交中..." : "提交"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!canCancel(order.status) || busy}
                            onClick={() => void applyOrderEvent(order, { type: "cancel", note: draft.note.trim() || undefined })}
                          >
                            {submittingKey === `${actionPrefix}cancel` ? "处理中..." : "取消"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!canSkip(order.status) || busy}
                            onClick={() => void applyOrderEvent(order, { type: "skip", note: draft.note.trim() || undefined })}
                          >
                            {submittingKey === `${actionPrefix}skip` ? "处理中..." : "跳过"}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="grid grid-cols-2 gap-1.5">
                          <Input
                            className="h-8"
                            placeholder="数量"
                            value={draft.qty}
                            disabled={isOrderFinal(order.status)}
                            onChange={(e) => setFillDrafts((prev) => ({
                              ...prev,
                              [order.orderId]: {
                                ...(prev[order.orderId] || { qty: "", price: "", fee: "0", note: "", final: false }),
                                qty: e.target.value,
                              },
                            }))}
                          />
                          <Input
                            className="h-8"
                            placeholder="价格"
                            value={draft.price}
                            disabled={isOrderFinal(order.status)}
                            onChange={(e) => setFillDrafts((prev) => ({
                              ...prev,
                              [order.orderId]: {
                                ...(prev[order.orderId] || { qty: "", price: "", fee: "0", note: "", final: false }),
                                price: e.target.value,
                              },
                            }))}
                          />
                          <Input
                            className="h-8"
                            placeholder="手续费"
                            value={draft.fee}
                            disabled={isOrderFinal(order.status)}
                            onChange={(e) => setFillDrafts((prev) => ({
                              ...prev,
                              [order.orderId]: {
                                ...(prev[order.orderId] || { qty: "", price: "", fee: "0", note: "", final: false }),
                                fee: e.target.value,
                              },
                            }))}
                          />
                          <label className="flex h-8 items-center gap-2 rounded-md border px-2 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={Boolean(draft.final)}
                              disabled={isOrderFinal(order.status)}
                              onChange={(e) => setFillDrafts((prev) => ({
                                ...prev,
                                [order.orderId]: {
                                  ...(prev[order.orderId] || { qty: "", price: "", fee: "0", note: "", final: false }),
                                  final: e.target.checked,
                                },
                              }))}
                            />
                            成交后完成
                          </label>
                          <Input
                            className="col-span-2 h-8"
                            placeholder="备注（可选）"
                            value={draft.note}
                            disabled={isOrderFinal(order.status)}
                            onChange={(e) => setFillDrafts((prev) => ({
                              ...prev,
                              [order.orderId]: {
                                ...(prev[order.orderId] || { qty: "", price: "", fee: "0", note: "", final: false }),
                                note: e.target.value,
                              },
                            }))}
                          />
                          <Button
                            type="button"
                            className="col-span-2"
                            size="sm"
                            disabled={!canFill(order.status) || busy}
                            onClick={() => void submitFill(order)}
                          >
                            {submittingKey === `${actionPrefix}fill` ? "记账中..." : "记录成交"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!selected?.orders?.length ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                      当前决策没有可执行订单。
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
