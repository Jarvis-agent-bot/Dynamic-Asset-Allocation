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
};

export type OrderDraft = { row: AssetUniverseView; side: "BUY" | "SELL" } | null;

export type CalibrationDraft = {
  row: AssetUniverseView;
  qty: string;
  holdingPrice: string;
  costBasis: string;
} | null;
