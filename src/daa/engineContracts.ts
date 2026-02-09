export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

// Keep these contracts intentionally loose for v0: the Python engine owns the details.
// We still want stable top-level expectations to reduce UI/engine drift.

export type RebalanceSimulateRequest = {
  money_plan: JsonValue;
  signals: JsonValue;
};

export type EngineErrorResponse = {
  error: string;
  message?: string;
  upstream?: string;
};

export function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function isEngineErrorResponse(x: unknown): x is EngineErrorResponse {
  if (!isPlainObject(x)) return false;
  if (typeof x.error !== "string") return false;

  if ("message" in x && x.message !== undefined && typeof x.message !== "string") return false;
  if ("upstream" in x && x.upstream !== undefined && typeof x.upstream !== "string") return false;

  return true;
}

export function isRebalanceSimulateRequest(x: unknown): x is RebalanceSimulateRequest {
  if (!isPlainObject(x)) return false;
  // v0: we still avoid deep shape validation, but require the top-level payloads to be objects.
  if (!("money_plan" in x) || !("signals" in x)) return false;

  const moneyPlan = (x as Record<string, unknown>).money_plan;
  const signals = (x as Record<string, unknown>).signals;

  return isPlainObject(moneyPlan) && isPlainObject(signals);
}
