import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("product-ui-logic-screenshot-optimization-v0", () => {
  it("adds a sign-in CTA in dashboard session-unavailable state", () => {
    const file = resolve(process.cwd(), "app/daa/dashboard/_components/DaaDashboardPageClient.tsx");
    const source = readFileSync(file, "utf8");

    expect(source).toContain("<Link href=\"/daa/login?returnTo=%2Fdaa%2Fdashboard\">Sign in again</Link>");
  });
});
