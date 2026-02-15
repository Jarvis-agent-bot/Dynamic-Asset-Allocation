import { describe, expect, it } from "vitest";

import { applyEmailPasteNormalizationV0 } from "../emailPasteV0";

describe("applyEmailPasteNormalizationV0", () => {
  it("trims whitespace and lowercases pasted email", () => {
    const r = applyEmailPasteNormalizationV0({
      value: "",
      selectionStart: 0,
      selectionEnd: 0,
      pastedText: "  Test@EXAMPLE.com\n",
    });

    expect(r.nextValue).toBe("test@example.com");
    expect(r.nextCaret).toBe("test@example.com".length);
  });

  it("inserts at caret and returns stable caret position", () => {
    const r = applyEmailPasteNormalizationV0({
      value: "ab",
      selectionStart: 1,
      selectionEnd: 1,
      pastedText: " CD ",
    });

    expect(r.nextValue).toBe("acdb");
    expect(r.nextCaret).toBe(3);
  });

  it("replaces selection", () => {
    const r = applyEmailPasteNormalizationV0({
      value: "hello",
      selectionStart: 1,
      selectionEnd: 4,
      pastedText: " X ",
    });

    expect(r.nextValue).toBe("hxo");
    expect(r.nextCaret).toBe(2);
  });

  it("no-ops for whitespace-only paste", () => {
    const r = applyEmailPasteNormalizationV0({
      value: "test@example.com",
      selectionStart: 0,
      selectionEnd: 4,
      pastedText: "   ",
    });

    expect(r.nextValue).toBe("test@example.com");
    expect(r.nextCaret).toBe(0);
  });
});
