"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getApiErrorMessageV1 } from "@/src/daa/api/clientV1";
import { confirmRebalanceExecutionV1, listRebalanceDecisionsV1 } from "@/src/daa/modules/execution/executionApiV1";
import type { ExecutionOrderV1, RebalanceDecisionV1 } from "@/src/daa/modules/execution/executionTypesV1";

type EditableOrder = {
  status: ExecutionOrderV1["status"];
  executedQty: string;
  executedPrice: string;
  fee: string;
  notes: string;
};

const DAA_DASHBOARD_REFRESH_EVENT_V1 = "daa:dashboard:refresh";
const DAA_DASHBOARD_DATA_UPDATED_EVENT_V1 = "daa:dashboard:data-updated";

export default function ExecutionPage() {
  const [decisions, setDecisions] = useState<RebalanceDecisionV1[]>([]);
  const [selectedDecisionId, setSelectedDecisionId] = useState<string>("");
  const [orderEdits, setOrderEdits] = useState<Record<string, EditableOrder>>({});
  const [cash, setCash] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const rows = await listRebalanceDecisionsV1({ limit: 100 });
      const pendingFirst = [...rows].sort((a, b) => {
        if (a.status === b.status) return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (a.status === "pending") return -1;
        if (b.status === "pending") return 1;
        return 0;
      });
      setDecisions(pendingFirst);

      if (!selectedDecisionId && pendingFirst.length > 0) {
        setSelectedDecisionId(pendingFirst[0].id);
      }
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

  useEffect(() => {
    if (!selected) {
      setOrderEdits({});
      return;
    }

    const next: Record<string, EditableOrder> = {};
    for (const order of selected.orders) {
      next[order.orderId] = {
        status: order.status,
        executedQty: order.executedQty ? String(order.executedQty) : "",
        executedPrice: order.executedPrice ? String(order.executedPrice) : "",
        fee: order.fee ? String(order.fee) : "0",
        notes: order.notes || "",
      };
    }
    setOrderEdits(next);
  }, [selected?.id]);

  async function submitConfirm() {
    if (!selected) return;
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const orders = selected.orders.map((order) => {
        const edit = orderEdits[order.orderId];
        return {
          orderId: order.orderId,
          status: (edit?.status || order.status) as ExecutionOrderV1["status"],
          executedQty: Number(edit?.executedQty || 0),
          executedPrice: Number(edit?.executedPrice || 0),
          fee: Number(edit?.fee || 0),
          notes: String(edit?.notes || "").trim() || undefined,
        };
      });

      await confirmRebalanceExecutionV1({
        decisionId: selected.id,
        cash: Number(cash || 0),
        orders,
      });

      setSuccess("执行回填已保存，持仓与权益快照已更新。");
      await load();
    } catch (e) {
      setError(getApiErrorMessageV1(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="执行回填" description="手动执行后在这里回填成交，系统自动写入交易日志并更新持仓。" />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>操作失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {success ? (
        <Alert>
          <AlertTitle>操作成功</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">待执行决策</CardTitle>
          <CardDescription>可选择历史决策进行回填和状态修正。</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">订单回填</CardTitle>
          <CardDescription>
            支持 pending / executed / skipped / partial 四种状态。可重复提交同一订单，系统仅按新增成交量记账。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-h-[420px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>代码</TableHead>
                  <TableHead>方向</TableHead>
                  <TableHead className="text-right">建议金额</TableHead>
                  <TableHead className="text-right">已记账数量</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>成交数量</TableHead>
                  <TableHead>成交价格</TableHead>
                  <TableHead>手续费</TableHead>
                  <TableHead>备注</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selected?.orders?.map((order) => {
                  const edit = orderEdits[order.orderId];
                  return (
                    <TableRow key={order.orderId}>
                      <TableCell className="font-medium">{order.symbol}</TableCell>
                      <TableCell>{order.side}</TableCell>
                      <TableCell className="text-right">{order.suggestedNotional.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {(Number(order.bookedQty || 0)).toFixed(4)}
                      </TableCell>
                      <TableCell>
                        <select
                          className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                          value={edit?.status || order.status}
                          onChange={(e) => setOrderEdits((prev) => ({
                            ...prev,
                            [order.orderId]: {
                              ...(prev[order.orderId] || {
                              executedQty: "",
                              executedPrice: "",
                              fee: "0",
                              notes: "",
                            }),
                              status: e.target.value as ExecutionOrderV1["status"],
                            },
                          }))}
                        >
                          <option value="pending">pending</option>
                          <option value="executed">executed</option>
                          <option value="partial">partial</option>
                          <option value="skipped">skipped</option>
                        </select>
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8"
                          value={edit?.executedQty || ""}
                          onChange={(e) => setOrderEdits((prev) => ({
                            ...prev,
                            [order.orderId]: {
                              ...(prev[order.orderId] || {
                                status: order.status,
                                executedPrice: "",
                                fee: "0",
                                notes: "",
                              }),
                              executedQty: e.target.value,
                            },
                          }))}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8"
                          value={edit?.executedPrice || ""}
                          onChange={(e) => setOrderEdits((prev) => ({
                            ...prev,
                            [order.orderId]: {
                              ...(prev[order.orderId] || {
                                status: order.status,
                                executedQty: "",
                                fee: "0",
                                notes: "",
                              }),
                              executedPrice: e.target.value,
                            },
                          }))}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8"
                          value={edit?.fee || "0"}
                          onChange={(e) => setOrderEdits((prev) => ({
                            ...prev,
                            [order.orderId]: {
                              ...(prev[order.orderId] || {
                                status: order.status,
                                executedQty: "",
                                executedPrice: "",
                                notes: "",
                              }),
                              fee: e.target.value,
                            },
                          }))}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8"
                          value={edit?.notes || ""}
                          onChange={(e) => setOrderEdits((prev) => ({
                            ...prev,
                            [order.orderId]: {
                              ...(prev[order.orderId] || {
                                status: order.status,
                                executedQty: "",
                                executedPrice: "",
                                fee: "0",
                              }),
                              notes: e.target.value,
                            },
                          }))}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-muted-foreground">回填后现金</label>
            <Input className="h-8 w-44" value={cash} onChange={(e) => setCash(e.target.value)} />
            <Button type="button" onClick={() => void submitConfirm()} disabled={!selected || submitting}>
              {submitting ? "提交中..." : "确认执行回填"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
