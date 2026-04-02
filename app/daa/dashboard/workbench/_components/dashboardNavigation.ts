import type { MouseEvent as ReactMouseEvent } from "react";

import { normalizeDashboardTab, type DashboardTab } from "@/app/daa/dashboard/_hooks/useDashboardModel";

export function resolveTabFromLocation(input: {
  section: string | null | undefined;
  searchTab: string | null | undefined;
  fallbackTab: DashboardTab;
}): DashboardTab {
  const section = String(input.section || "").trim().toLowerCase();
  if (section === "rebalance") return "rebalance";
  if (section === "cash") return "cash";
  if (section === "portfolio") {
    return normalizeDashboardTab(
      input.searchTab || (input.fallbackTab === "watchlist" ? "watchlist" : "positions"),
    );
  }
  if (section === "cockpit") {
    return normalizeDashboardTab(input.searchTab || "positions");
  }
  if (input.searchTab) {
    return normalizeDashboardTab(input.searchTab);
  }
  return input.fallbackTab;
}

export function shouldHandleAnchorClick(
  event: Pick<ReactMouseEvent<HTMLAnchorElement>, "defaultPrevented" | "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
): boolean {
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  return true;
}
