"use client";

import { logSwallowed } from "@/src/daa/utils/logSwallowed";

// Best-effort clipboard helper for user-initiated actions.
// Falls back to `execCommand('copy')` for environments where Clipboard API is unavailable.
export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (err) {
  logSwallowed("copyToClipboard.clipboardApi", err);
    }
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard is not available (no document).");
  }

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "-9999px";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);

  ta.select();
  ta.setSelectionRange(0, ta.value.length);

  const ok = document.execCommand("copy");
  document.body.removeChild(ta);

  if (!ok) {
    throw new Error("Copy failed.");
  }
}
