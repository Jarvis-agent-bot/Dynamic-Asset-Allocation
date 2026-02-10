export type DaaEngineHealthResponse = {
  ok: true;
  service: "daa-engine";
  version: string;
};

export type DaaEngineErrorResponse = {
  ok: false;
  error: string;
  message?: string;
};

// v0 contract for POST /v1/rebalance/simulate
// Keep this loose: enforce types when fields exist, but don't require deep shapes.
export type DaaEngineRebalanceSimulateResponse = {
  orders?: unknown[];
  // Engine returns an object today (policy/constraints/etc), but allow strings for flexibility.
  explain?: unknown;
  warnings?: string[];
};

export function isDaaEngineHealthResponse(v: unknown): v is DaaEngineHealthResponse {
  if (!v || typeof v !== "object") return false;

  const o = v as Record<string, unknown>;
  return o.ok === true && o.service === "daa-engine" && typeof o.version === "string";
}

export function isDaaEngineRebalanceSimulateResponse(v: unknown): v is DaaEngineRebalanceSimulateResponse {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;

  const o = v as Record<string, unknown>;

  if ("orders" in o && o.orders !== undefined && !Array.isArray(o.orders)) return false;

  // `explain` may be a string or a JSON object; just ensure it's JSON-serializable-ish.
  if ("explain" in o && o.explain !== undefined) {
    const t = typeof o.explain;
    if (!(t === "string" || t === "object")) return false;
  }

  if (
    "warnings" in o &&
    o.warnings !== undefined &&
    (!Array.isArray(o.warnings) || (o.warnings as unknown[]).some((x) => typeof x !== "string"))
  ) {
    return false;
  }

  return true;
}
