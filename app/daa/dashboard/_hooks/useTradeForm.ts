"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkbenchMarketOrderPreviewResult } from "@/src/daa/modules/workbench/workbenchTypes";

export type TradeFormCallbacks = {
  onPreview: (input: {
    assetKey: string;
    side: "BUY" | "SELL";
    qty?: number;
    notional?: number;
  }) => Promise<WorkbenchMarketOrderPreviewResult>;
  onSubmit: (preview: WorkbenchMarketOrderPreviewResult) => Promise<void>;
};

export function useTradeForm(input: {
  assetKey: string | null;
  side: "BUY" | "SELL";
  callbacks: TradeFormCallbacks | null;
  /** 外部 submitting 状态 */
  submitting?: boolean;
  /** 重置触发器（如 dialog open 状态变化） */
  resetKey?: unknown;
}) {
  const [qty, setQty] = useState("");
  const [notional, setNotional] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<WorkbenchMarketOrderPreviewResult | null>(null);
  const [error, setError] = useState("");

  // 资产/方向/resetKey 变化时重置表单
  useEffect(() => {
    setQty("");
    setNotional("");
    setPreview(null);
    setError("");
    setPreviewLoading(false);
  }, [input.assetKey, input.side, input.resetKey]);

  const qtyNum = useMemo(() => {
    const n = Number(qty);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [qty]);

  const notionalNum = useMemo(() => {
    const n = Number(notional);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [notional]);

  const blockedRiskMessage = useMemo(() => {
    return preview?.riskCheck?.items.find((item) => item.status === "block")?.message || "";
  }, [preview]);

  const displayWarnings = useMemo(() => {
    if (!preview) return [] as string[];
    if (!blockedRiskMessage) return preview.warnings;
    return preview.warnings.filter((item) => !item.includes(blockedRiskMessage));
  }, [blockedRiskMessage, preview]);

  const inputModeLabel = qtyNum > 0 ? "按数量预估" : notionalNum > 0 ? "按金额预估" : "等待输入";
  const inputModeTone = qtyNum > 0 ? "green" : notionalNum > 0 ? "amber" : "slate";

  function resetPreviewState() {
    if (preview) setPreview(null);
    if (error) setError("");
  }

  function handleQtyChange(value: string) {
    resetPreviewState();
    setQty(value);
    if (Number(value) > 0) setNotional("");
  }

  function handleNotionalChange(value: string) {
    resetPreviewState();
    setNotional(value);
    if (Number(value) > 0) setQty("");
  }

  /** 设置快捷比例 */
  function handleShortcut(params: { holdingQty: number; availableCash: number; lastPrice: number; pct: number }) {
    resetPreviewState();
    const { holdingQty, availableCash, lastPrice, pct } = params;
    if (input.side === "SELL" && holdingQty > 0) {
      const q = (pct * holdingQty).toFixed(6);
      setQty(q);
      setNotional("");
    } else if (input.side === "BUY" && lastPrice > 0 && availableCash > 0) {
      const q = ((pct * availableCash) / lastPrice).toFixed(6);
      setQty(q);
      setNotional("");
    }
  }

  const handlePreview = useCallback(async () => {
    if (!input.assetKey || !input.callbacks || previewLoading) return;
    if (!(qtyNum > 0) && !(notionalNum > 0)) {
      setError("请输入数量或金额，且至少一个字段大于 0。");
      return;
    }
    setError("");
    setPreviewLoading(true);
    try {
      const res = await input.callbacks.onPreview({
        assetKey: input.assetKey,
        side: input.side,
        qty: qtyNum > 0 ? qtyNum : undefined,
        notional: notionalNum > 0 ? notionalNum : undefined,
      });
      setPreview(res);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "预览失败");
    } finally {
      setPreviewLoading(false);
    }
  }, [input.assetKey, input.side, input.callbacks, previewLoading, qtyNum, notionalNum]);

  const handleSubmit = useCallback(async () => {
    if (!preview || input.submitting || !input.callbacks) return;
    await input.callbacks.onSubmit(preview);
  }, [preview, input.submitting, input.callbacks]);

  const canPreview = (qtyNum > 0 || notionalNum > 0) && !previewLoading;
  const canSubmit = !!preview && !input.submitting && preview.canSubmit !== false;

  return {
    qty,
    notional,
    qtyNum,
    notionalNum,
    preview,
    previewLoading,
    error,
    blockedRiskMessage,
    displayWarnings,
    inputModeLabel,
    inputModeTone: inputModeTone as "green" | "amber" | "slate",
    canPreview,
    canSubmit,
    handleQtyChange,
    handleNotionalChange,
    handleShortcut,
    handlePreview,
    handleSubmit,
  };
}
