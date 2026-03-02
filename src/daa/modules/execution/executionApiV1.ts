import { requestDataV1 } from "@/src/daa/api/clientV1";

import type {
  ApplyExecutionEventsInputV1,
  ApplyExecutionEventsResultV1,
  RebalanceDecisionV1,
  RebalanceDecisionStatusV1,
  ReconcileResultV1,
  UnifiedPlanEnvelopeV1,
} from "./executionTypesV1";

export async function listRebalanceDecisionsV1(opts: {
  limit?: number;
  status?: RebalanceDecisionStatusV1;
} = {}): Promise<RebalanceDecisionV1[]> {
  const params = new URLSearchParams();
  if (opts.limit != null) params.set("limit", String(Math.max(1, Math.trunc(opts.limit))));
  if (opts.status) params.set("status", opts.status);
  const qs = params.toString();

  const data = await requestDataV1<{ decisions: RebalanceDecisionV1[] }>(
    `/api/daa/rebalance/decisions${qs ? `?${qs}` : ""}`,
    { method: "GET", cache: "no-store" },
  );
  return Array.isArray(data.decisions) ? data.decisions : [];
}

export async function applyExecutionEventsV1(input: ApplyExecutionEventsInputV1): Promise<ApplyExecutionEventsResultV1> {
  return requestDataV1<ApplyExecutionEventsResultV1>("/api/daa/rebalance/execution/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function reconcileDecisionPositionsV1(decisionId: string): Promise<ReconcileResultV1> {
  const data = await requestDataV1<ReconcileResultV1>(
    `/api/daa/rebalance/reconcile?decisionId=${encodeURIComponent(decisionId)}`,
    { method: "GET", cache: "no-store" },
  );
  return data;
}

export async function runUnifiedRebalanceV1<TPlan = Record<string, unknown>>(
  request: Record<string, unknown>,
  opts: { persist?: boolean } = {},
): Promise<UnifiedPlanEnvelopeV1<TPlan>> {
  const persist = opts.persist !== false;
  const data = await requestDataV1<UnifiedPlanEnvelopeV1<TPlan>>(
    `/api/daa/rebalance/unified?persist=${persist ? "1" : "0"}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(request),
    },
  );
  return data;
}
