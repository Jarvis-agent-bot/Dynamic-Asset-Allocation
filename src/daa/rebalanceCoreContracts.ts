import { isPlainObject } from "./engineContracts";

import type { RebalanceCoreRequest } from "../core/rebalanceCore";

export type { RebalanceCoreRequest };

function isArrayOrPlainObject(x: unknown) {
  return Array.isArray(x) || isPlainObject(x);
}

// v0: keep the contract shallow and forgiving. The core algorithm will surface
// warnings for missing/invalid fields instead of failing hard.
export function isRebalanceCoreRequest(x: unknown): x is RebalanceCoreRequest {
  if (!isPlainObject(x)) return false;

  if (!("holdings" in x) || !("prices" in x) || !("targetWeights" in x)) return false;

  const o = x as Record<string, unknown>;
  if (!isArrayOrPlainObject(o.holdings)) return false;
  if (!isArrayOrPlainObject(o.prices)) return false;
  if (!isArrayOrPlainObject(o.targetWeights)) return false;

  if ("account" in o && o.account !== undefined && o.account !== null && !isPlainObject(o.account)) return false;
  if ("constraints" in o && o.constraints !== undefined && o.constraints !== null && !isPlainObject(o.constraints)) return false;

  return true;
}
