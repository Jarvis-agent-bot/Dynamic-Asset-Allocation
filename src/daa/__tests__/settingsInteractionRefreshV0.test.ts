import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function read(relPath: string): string {
  return readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("settings interaction refresh contract v0", () => {
  it("keeps settings auth state refreshable via button and tab-focus events", () => {
    const pageSource = read("app/daa/dashboard/settings/_components/DaaDashboardSettingsPageClient.tsx");

    expect(pageSource).toContain("Refresh session");
    expect(pageSource).toContain('window.addEventListener("focus", onFocus)');
    expect(pageSource).toContain('document.addEventListener("visibilitychange", onVisibilityChange)');
  });

  it("shows session ttl in settings tab", () => {
    const tabSource = read("app/daa/dashboard/_tabs/DaaSettingsTab.tsx");
    expect(tabSource).toContain("Time remaining");
    expect(tabSource).toContain("formatSessionRemainingV0");
  });
});
