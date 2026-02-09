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

export function isDaaEngineHealthResponse(v: unknown): v is DaaEngineHealthResponse {
  if (!v || typeof v !== "object") return false;

  const o = v as Record<string, unknown>;
  return o.ok === true && o.service === "daa-engine" && typeof o.version === "string";
}
