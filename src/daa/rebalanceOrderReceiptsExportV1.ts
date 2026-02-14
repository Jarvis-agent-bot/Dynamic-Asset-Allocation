import type { RebalanceOrderStatusRunV0 } from "./rebalanceOrderStatusRunStoreV0";

export const REBALANCE_ORDER_RECEIPTS_SCHEMA_VERSION = 1 as const;

export type RebalanceOrderReceiptsV1 = {
  schemaVersion: 1;
  kind: "rebalance_order_receipts";
  exportedAt: string;
  summary: {
    totalOrders: number;
    filled: number;
    failed: number;
  };
  run: RebalanceOrderStatusRunV0;
};

function nowIso() {
  return new Date().toISOString();
}

function computeSummary(run: RebalanceOrderStatusRunV0): RebalanceOrderReceiptsV1["summary"] {
  const orders = Array.isArray(run?.orders) ? run.orders : [];
  const filled = orders.filter((o) => o?.status === "filled").length;
  const failed = orders.filter((o) => o?.status === "failed").length;
  return { totalOrders: orders.length, filled, failed };
}

export function buildRebalanceOrderReceiptsV1(args: {
  run: RebalanceOrderStatusRunV0;
  exportedAt?: string;
}): RebalanceOrderReceiptsV1 {
  return {
    schemaVersion: REBALANCE_ORDER_RECEIPTS_SCHEMA_VERSION,
    kind: "rebalance_order_receipts",
    exportedAt: args.exportedAt ?? nowIso(),
    summary: computeSummary(args.run),
    run: args.run,
  };
}
