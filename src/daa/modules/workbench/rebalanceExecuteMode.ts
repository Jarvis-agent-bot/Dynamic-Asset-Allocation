export type RebalanceExecuteMode = "selected" | "all";

export function normalizeRebalanceExecuteMode(value: unknown): RebalanceExecuteMode {
  return String(value || "").trim().toLowerCase() === "all" ? "all" : "selected";
}
