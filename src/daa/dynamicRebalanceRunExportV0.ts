import type { RebalanceLogEntryV0 } from "./rebalanceLogStore";
import type { RebalanceOrderStatusRunV0 } from "./rebalanceOrderStatusRunStoreV0";

export type DynamicRebalanceAllocationRowV0 = {
  id: string;
  label: string;
  currentValue: number;
  targetValue: number;
  currentPct: number;
  targetPct: number;
  deltaPct: number;
};

export type DynamicRebalanceAllocationsSnapshotV0 = {
  equity: number;
  rows: DynamicRebalanceAllocationRowV0[];
};

export type DynamicRebalanceRunAuditBundleV0 = {
  schemaVersion: 1;
  kind: "daa.dynamicRebalance.run.audit.v0";
  exportedAt: string;
  run: RebalanceOrderStatusRunV0;
  coreLogEntry?: RebalanceLogEntryV0;
  derived: {
    ordersTotal: number;
    ordersFilled: number;
    ordersFailed: number;
    allocations?: DynamicRebalanceAllocationsSnapshotV0;
  };
};

function nowIso(): string {
  return new Date().toISOString();
}

function safeNum(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

export function extractDynamicRebalanceAllocationsFromCoreResponseV0(
  resp: unknown,
): DynamicRebalanceAllocationsSnapshotV0 | null {
  if (!resp || typeof resp !== "object") return null;

  const r: any = resp as any;
  const explain = r?.explain;

  const equity = safeNum(explain?.equity);
  if (!equity || equity <= 0) return null;

  const currentValues: Record<string, number> =
    explain?.currentValues && typeof explain.currentValues === "object" && !Array.isArray(explain.currentValues)
      ? (explain.currentValues as any)
      : {};
  const desiredValues: Record<string, number> =
    explain?.desiredValues && typeof explain.desiredValues === "object" && !Array.isArray(explain.desiredValues)
      ? (explain.desiredValues as any)
      : {};

  const labels: Record<string, string> = {};
  if (Array.isArray(r?.targetWeights)) {
    for (const w of r.targetWeights) {
      const id = String((w as any)?.id ?? "").trim();
      if (!id) continue;
      const label = String((w as any)?.label ?? id).trim() || id;
      labels[id] = label;
    }
  }

  const ids = new Set<string>([...Object.keys(currentValues), ...Object.keys(desiredValues), ...Object.keys(labels)]);

  const rows: DynamicRebalanceAllocationRowV0[] = [];
  for (const id of ids) {
    const curV = safeNum((currentValues as any)[id]) ?? 0;
    const desV = safeNum((desiredValues as any)[id]) ?? 0;

    const currentPct = curV / equity;
    const targetPct = desV / equity;

    if (!(Math.abs(currentPct) > 1e-9 || Math.abs(targetPct) > 1e-9)) continue;

    rows.push({
      id,
      label: labels[id] ?? id,
      currentValue: curV,
      targetValue: desV,
      currentPct,
      targetPct,
      deltaPct: currentPct - targetPct,
    });
  }

  rows.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct) || a.id.localeCompare(b.id));
  return { equity, rows };
}

export function buildDynamicRebalanceRunAuditBundleV0(args: {
  run: RebalanceOrderStatusRunV0;
  coreLogEntry?: RebalanceLogEntryV0 | null;
  exportedAt?: string;
}): DynamicRebalanceRunAuditBundleV0 {
  const orders = Array.isArray(args.run?.orders) ? args.run.orders : [];
  const ordersFilled = orders.filter((o) => o?.status === "filled").length;
  const ordersFailed = orders.filter((o) => o?.status === "failed").length;

  const coreLogEntry = args.coreLogEntry ?? undefined;
  const allocations = extractDynamicRebalanceAllocationsFromCoreResponseV0(coreLogEntry?.response);

  return {
    schemaVersion: 1,
    kind: "daa.dynamicRebalance.run.audit.v0",
    exportedAt: args.exportedAt ?? nowIso(),
    run: args.run,
    coreLogEntry,
    derived: {
      ordersTotal: orders.length,
      ordersFilled,
      ordersFailed,
      allocations: allocations ?? undefined,
    },
  };
}

function csvEscapeCell(x: unknown): string {
  if (x === null || x === undefined) return "";

  const s = typeof x === "string" ? x : String(x);
  // RFC4180-ish: quote if contains comma, quote, CR or LF.
  if (!/[\",\r\n]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(lines: unknown[][]): string {
  return lines.map((row) => row.map(csvEscapeCell).join(",")).join("\n") + "\n";
}

export function buildDynamicRebalanceRunOrdersCsvV0(args: { run: RebalanceOrderStatusRunV0 }): string {
  const run = args.run;
  const lines: unknown[][] = [
    [
      "runId",
      "createdAt",
      "updatedAt",
      "state",
      "phase",
      "orderId",
      "symbol",
      "side",
      "notional",
      "status",
      "orderUpdatedAt",
      "filledNotional",
      "fillPct01",
      "detail",
    ],
  ];

  const orders = Array.isArray(run?.orders) ? run.orders : [];
  for (const o of orders) {
    lines.push([
      run.runId,
      run.createdAt,
      run.updatedAt,
      run.state,
      run.phase,
      o.id,
      o.symbol,
      o.side,
      o.notional,
      o.status,
      o.updatedAt,
      o.filledNotional ?? "",
      o.fillPct01 ?? "",
      o.detail ?? "",
    ]);
  }

  return toCsv(lines);
}

export function buildDynamicRebalanceRunAllocationsCsvV0(args: {
  runId: string;
  coreLogEntry?: RebalanceLogEntryV0 | null;
}): string | null {
  const allocations = extractDynamicRebalanceAllocationsFromCoreResponseV0(args.coreLogEntry?.response);
  if (!allocations) return null;

  const lines: unknown[][] = [
    [
      "runId",
      "equity",
      "assetId",
      "label",
      "currentValue",
      "targetValue",
      "currentPct",
      "targetPct",
      "deltaPct",
    ],
  ];

  for (const r of allocations.rows) {
    lines.push([
      args.runId,
      allocations.equity,
      r.id,
      r.label,
      r.currentValue,
      r.targetValue,
      r.currentPct,
      r.targetPct,
      r.deltaPct,
    ]);
  }

  return toCsv(lines);
}

function tryAttachReasonsToRunOrders(args: {
  runOrders: RebalanceOrderStatusRunV0["orders"];
  coreOrders: RebalanceLogEntryV0["orders"];
}): { reasonByIdx: Map<number, string> } {
  const reasonByIdx = new Map<number, string>();

  // Fast path: 1:1 positional match (most common).
  if (args.coreOrders.length === args.runOrders.length) {
    for (let i = 0; i < args.runOrders.length; i++) {
      const reason = args.coreOrders[i]?.reason;
      if (typeof reason === "string" && reason.trim()) reasonByIdx.set(i, reason);
    }
    return { reasonByIdx };
  }

  // Best-effort match: (symbol, side) then closest notional.
  const used = new Set<number>();
  for (let i = 0; i < args.runOrders.length; i++) {
    const o = args.runOrders[i];
    if (!o) continue;

    let bestIdx = -1;
    let bestDiff = Number.POSITIVE_INFINITY;

    for (let j = 0; j < args.coreOrders.length; j++) {
      if (used.has(j)) continue;
      const c = args.coreOrders[j];
      if (!c) continue;
      if (String(c.symbol) !== String(o.symbol)) continue;
      if (String(c.side) !== String(o.side)) continue;

      const diff = Math.abs(Number(c.notional) - Number(o.notional));
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = j;
      }
    }

    if (bestIdx >= 0) {
      used.add(bestIdx);
      const reason = args.coreOrders[bestIdx]?.reason;
      if (typeof reason === "string" && reason.trim()) reasonByIdx.set(i, reason);
    }
  }

  return { reasonByIdx };
}

export function buildDynamicRebalanceRunAuditLogCsvV0(args: {
  run: RebalanceOrderStatusRunV0;
  coreLogEntry?: RebalanceLogEntryV0 | null;
}): string {
  const run = args.run;
  const runOrders = Array.isArray(run?.orders) ? run.orders : [];
  const coreOrders = Array.isArray(args.coreLogEntry?.orders) ? args.coreLogEntry!.orders : [];
  const reasonByIdx = tryAttachReasonsToRunOrders({ runOrders, coreOrders }).reasonByIdx;

  const lines: unknown[][] = [
    [
      "runId",
      "runCreatedAt",
      "runUpdatedAt",
      "runState",
      "runPhase",
      "coreLoggedAt",
      "orderId",
      "symbol",
      "side",
      "notional",
      "reason",
      "status",
      "orderUpdatedAt",
      "filledNotional",
      "fillPct01",
      "detail",
    ],
  ];

  const coreAt = args.coreLogEntry?.at ?? "";

  for (let i = 0; i < runOrders.length; i++) {
    const o = runOrders[i];
    lines.push([
      run.runId,
      run.createdAt,
      run.updatedAt,
      run.state,
      run.phase,
      coreAt,
      o.id,
      o.symbol,
      o.side,
      o.notional,
      reasonByIdx.get(i) ?? "",
      o.status,
      o.updatedAt,
      o.filledNotional ?? "",
      o.fillPct01 ?? "",
      o.detail ?? "",
    ]);
  }

  return toCsv(lines);
}
