export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type RebalanceSimulateSignal = {
  symbol: string;
  action: string;
  score: number;
};

export type RebalanceSimulateRequest = {
  money_plan: JsonValue;
  signals: RebalanceSimulateSignal[];
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
  if (!("money_plan" in x) || !("signals" in x)) return false;

  const moneyPlan = (x as Record<string, unknown>).money_plan;
  const signals = (x as Record<string, unknown>).signals;
  if (!isPlainObject(moneyPlan) || !Array.isArray(signals)) return false;

  return signals.every((item) => {
    if (!isPlainObject(item)) return false;
    const symbol = String(item.symbol || "").trim();
    const action = String(item.action || "").trim();
    const score = Number(item.score);
    return symbol.length > 0 && action.length > 0 && Number.isFinite(score);
  });
}
