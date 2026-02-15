export type ApplyEmailPasteNormalizationArgsV0 = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  pastedText: string;
};

export type ApplyEmailPasteNormalizationResultV0 = {
  nextValue: string;
  nextCaret: number;
  inserted: string;
};

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

/**
 * Email paste normalization v0:
 * - Trim whitespace and lowercase the pasted chunk
 * - Return a stable caret position (end of inserted chunk)
 */
export function applyEmailPasteNormalizationV0(args: ApplyEmailPasteNormalizationArgsV0): ApplyEmailPasteNormalizationResultV0 {
  const value = String(args.value || "");
  const pastedRaw = String(args.pastedText || "");
  const inserted = pastedRaw.trim().toLowerCase();

  const a = clamp(args.selectionStart ?? value.length, 0, value.length);
  const b = clamp(args.selectionEnd ?? a, 0, value.length);
  const start = Math.min(a, b);
  const end = Math.max(a, b);

  if (!inserted) {
    return { nextValue: value, nextCaret: start, inserted: "" };
  }

  const nextValue = value.slice(0, start) + inserted + value.slice(end);
  const nextCaret = start + inserted.length;

  return { nextValue, nextCaret, inserted };
}
