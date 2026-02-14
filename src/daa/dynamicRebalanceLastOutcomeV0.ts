import type { DynamicRebalanceSkipLogEntryV0 } from "./dynamicRebalanceSkipLogStoreV0";
import type { RebalanceOrderStatusRunV0 } from "./rebalanceOrderStatusRunStoreV0";

export type DynamicRebalanceLastOutcomeKindV0 = "success" | "failure" | "canceled";

export type DynamicRebalanceLastOutcomeEventV0 = {
  kind: DynamicRebalanceLastOutcomeKindV0;
  atIso: string;
  // Used for dismissing UI banners across reloads.
  signature: string;

  // Exactly one of these is present based on `kind`.
  run?: RebalanceOrderStatusRunV0;
  skip?: DynamicRebalanceSkipLogEntryV0;

  // Optional UI-friendly summary.
  summary?: {
    ordersTotal?: number;
    ordersFailed?: number;
    ordersFilled?: number;
  };
};

function parseIsoMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function computeCounts(run: RebalanceOrderStatusRunV0): { total: number; filled: number; failed: number } {
  const orders = Array.isArray(run?.orders) ? run.orders : [];
  const filled = orders.filter((o) => o?.status === "filled").length;
  const failed = orders.filter((o) => o?.status === "failed").length;
  return { total: orders.length, filled, failed };
}

export function computeLastDynamicRebalanceOutcomeV0(args: {
  runs: RebalanceOrderStatusRunV0[];
  skips: DynamicRebalanceSkipLogEntryV0[];
}): DynamicRebalanceLastOutcomeEventV0 | null {
  const runs = Array.isArray(args.runs) ? args.runs : [];
  const skips = Array.isArray(args.skips) ? args.skips : [];

  const terminalRuns = runs.filter((r) => r && (r.state === "done" || r.state === "error"));

  const bestRun = terminalRuns
    .map((r) => ({ run: r, ms: parseIsoMs(r.updatedAt) }))
    .sort((a, b) => b.ms - a.ms)[0];

  const userCancelled = skips.filter((e) => e && e.kind === "user-cancelled");
  const bestCancel = userCancelled
    .map((e) => ({ skip: e, ms: parseIsoMs(e.at) || parseIsoMs(e.recordedAt) }))
    .sort((a, b) => b.ms - a.ms)[0];

  const runMs = bestRun?.ms ?? 0;
  const cancelMs = bestCancel?.ms ?? 0;

  if (!runMs && !cancelMs) return null;

  if (cancelMs > runMs) {
    const e = bestCancel!.skip;
    return {
      kind: "canceled",
      atIso: e.at,
      signature: `canceled:${e.id}:${e.at}`,
      skip: e,
    };
  }

  const r = bestRun!.run;
  const c = computeCounts(r);
  const isFailure = r.state === "error" || c.failed > 0;
  const kind: DynamicRebalanceLastOutcomeKindV0 = isFailure ? "failure" : "success";

  return {
    kind,
    atIso: r.updatedAt,
    signature: `${kind}:${r.runId}:${r.updatedAt}`,
    run: r,
    summary: { ordersTotal: c.total, ordersFailed: c.failed, ordersFilled: c.filled },
  };
}
