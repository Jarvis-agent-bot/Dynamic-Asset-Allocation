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

export function isRebalanceSimulateRequest(x: unknown): x is RebalanceSimulateRequest {
  if (!x || typeof x !== "object") return false;
  const obj = x as Record<string, unknown>;

  // money_plan/signals can be any JSON value (including null); only require presence.
  return Object.prototype.hasOwnProperty.call(obj, "money_plan") && Object.prototype.hasOwnProperty.call(obj, "signals");
}

export type EngineErrorResponse = {
  error: string;
  message?: string;
  upstream?: string;
};
