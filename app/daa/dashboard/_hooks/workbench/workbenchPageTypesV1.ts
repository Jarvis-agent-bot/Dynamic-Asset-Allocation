import type { AssetUniverseViewV1 } from "@/src/daa/modules/workbench/workbenchTypesV1";

export type ExecutionReceiptV1 = {
  cycleId: string;
  mode: "selected" | "all";
  status: "success" | "partial" | "failed" | "blocked";
  executed: number;
  failed: number;
  summary: string;
  reason?: string;
  ts: string;
};

export type OrderDraftV1 = { row: AssetUniverseViewV1; side: "BUY" | "SELL" } | null;

export type CalibrationDraftV1 = {
  row: AssetUniverseViewV1;
  qty: string;
  holdingPrice: string;
  costBasis: string;
} | null;
