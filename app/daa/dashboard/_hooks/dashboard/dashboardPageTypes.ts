import type { RebalanceExecuteMode } from "@/src/daa/modules/workbench/rebalanceExecuteMode";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";

export type ExecutionReceipt = {
  cycleId: string;
  mode: RebalanceExecuteMode;
  status: "success" | "submitted" | "partial" | "failed" | "blocked";
  executed: number;
  submitted?: number;
  failed: number;
  summary: string;
  reason?: string;
  ts: string;
  /** 确认时预估值与实际成交的对比说明（执行会按最新刷新价 + 滑点重算，二者可能有差异）。 */
  estimateNote?: string;
};

export type OrderDraft = { row: AssetUniverseView; side: "BUY" | "SELL" } | null;

export type CalibrationDraft = {
  row: AssetUniverseView;
  qty: string;
  holdingPrice: string;
  costBasis: string;
} | null;
