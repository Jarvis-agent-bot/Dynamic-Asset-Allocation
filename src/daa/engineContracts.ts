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
