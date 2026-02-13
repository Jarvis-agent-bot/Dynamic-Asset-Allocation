import type { RebalanceRunReportV1 } from "./rebalanceReportExport";

import { base64UrlDecodeUtf8, base64UrlEncodeUtf8 } from "./base64url";

export function encodeRebalanceRunReportToShareToken(report: RebalanceRunReportV1): string {
  // Keep it plain JSON for debuggability; base64url makes it safe for URL fragments.
  return base64UrlEncodeUtf8(JSON.stringify(report));
}

export function decodeRebalanceRunReportFromShareToken(token: string): RebalanceRunReportV1 | null {
  try {
    const raw = base64UrlDecodeUtf8(token);
    const obj = JSON.parse(raw) as any;

    if (!obj || typeof obj !== "object") return null;
    if (obj.kind !== "rebalance_run_report") return null;
    if (obj.schemaVersion !== 1) return null;

    return obj as RebalanceRunReportV1;
  } catch {
    return null;
  }
}
