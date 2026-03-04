"use client";

import { useEffect, useMemo, useState } from "react";

import { Loader2, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AssetUniverseViewV1, WorkbenchMarketOrderPreviewResultV1 } from "@/src/daa/modules/workbench/workbenchTypesV1";

export default function MarketOrderDialog(props: {
  open: boolean;
  row: AssetUniverseViewV1 | null;
  side: "BUY" | "SELL";
  loading?: boolean;
  onOpenChange: (next: boolean) => void;
  onPreview: (input: { assetKey: string; side: "BUY" | "SELL"; qty?: number; notional?: number }) => Promise<WorkbenchMarketOrderPreviewResultV1>;
  onSubmit: (preview: WorkbenchMarketOrderPreviewResultV1) => Promise<void>;
}) {
  const [qty, setQty] = useState("");
  const [notional, setNotional] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<WorkbenchMarketOrderPreviewResultV1 | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!props.open) {
      setQty("");
      setNotional("");
      setPreview(null);
      setError("");
      setPreviewLoading(false);
    }
  }, [props.open]);

  const qtyNum = useMemo(() => {
    const n = Number(qty);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [qty]);

  const notionalNum = useMemo(() => {
    const n = Number(notional);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [notional]);

  async function handlePreview() {
    if (!props.row || previewLoading) return;
    if (!(qtyNum > 0) && !(notionalNum > 0)) {
      setError("请输入数量或金额（至少一个 > 0）。");
      return;
    }

    setError("");
    setPreviewLoading(true);
    try {
      const res = await props.onPreview({
        assetKey: props.row.assetKey,
        side: props.side,
        qty: qtyNum > 0 ? qtyNum : undefined,
        notional: notionalNum > 0 ? notionalNum : undefined,
      });
      setPreview(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "预览失败");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSubmit() {
    if (!preview || props.loading) return;
    await props.onSubmit(preview);
    props.onOpenChange(false);
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.side === "BUY" ? "市价买入" : "市价卖出"} {props.row?.symbol || ""}</DialogTitle>
          <DialogDescription>系统会自动使用后端最新价格预览，不做风险阻断，仅提示风险。</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          <div className="space-y-1.5">
            <Label>数量（可选）</Label>
            <Input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="例如 1.5" type="number" min="0" step="0.000001" />
          </div>
          <div className="space-y-1.5">
            <Label>金额（可选）</Label>
            <Input value={notional} onChange={(e) => setNotional(e.target.value)} placeholder="例如 1000" type="number" min="0" step="0.01" />
          </div>
          <Button type="button" variant="outline" onClick={() => void handlePreview()} disabled={previewLoading}>
            {previewLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {previewLoading ? "预览中..." : "生成预览"}
          </Button>
        </div>

        {error ? <div className="text-xs text-destructive">{error}</div> : null}

        {preview ? (
          <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-xs">
            <div>价格：{preview.currency} {preview.price.toFixed(4)}（{preview.priceSource}）</div>
            <div>数量：{preview.qty.toFixed(6)} · 名义金额：{preview.currency} {preview.grossNotional.toFixed(4)}</div>
            <div>基准币金额：{preview.baseCurrency} {preview.notionalInBase.toFixed(4)} · 手续费：{preview.currency} {preview.fee.toFixed(4)}</div>
            <div>价格时间：{new Date(preview.priceSnapshotAt).toLocaleString()}</div>
            {preview.warnings.length ? (
              <Alert variant="destructive">
                <TriangleAlert className="h-4 w-4" />
                <AlertTitle>风险提示（不阻断）</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc space-y-1 pl-4">
                    {preview.warnings.map((item, idx) => (
                      <li key={`w-${idx}`}>{item}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>取消</Button>
          <Button onClick={() => void handleSubmit()} disabled={!preview || props.loading}>
            {props.loading ? "提交中..." : "加入执行队列"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
