import { normalizeText } from "@/src/daa/utils/normalize";

function pickArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

export function normalizeTradeSide(value: unknown): "BUY" | "SELL" | null {
  const side = normalizeText(value).toUpperCase();
  if (side === "BUY" || side === "SELL") return side;
  return null;
}

export function normalizeReasonTags(value: unknown): string[] {
  return pickArray(value).map((item) => item.toLowerCase());
}
