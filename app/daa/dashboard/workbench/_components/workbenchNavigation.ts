import type { MouseEvent as ReactMouseEvent } from "react";

import { normalizeWorkbenchTab, type WorkbenchTab } from "@/app/daa/dashboard/_hooks/useWorkbenchModel";

export function resolveWorkbenchTabFromLocation(input: {
  section: string | null | undefined;
  searchTab: string | null | undefined;
  fallbackTab: WorkbenchTab;
}): WorkbenchTab {
  const section = String(input.section || "").trim().toLowerCase();
  if (section === "rebalance") return "rebalance";
  if (section === "cash") return "cash";
  if (section === "portfolio") {
    return normalizeWorkbenchTab(
      input.searchTab || (input.fallbackTab === "watchlist" ? "watchlist" : "positions"),
    );
  }
  if (section === "cockpit") {
    return normalizeWorkbenchTab(input.searchTab || "positions");
  }
  if (input.searchTab) {
    return normalizeWorkbenchTab(input.searchTab);
  }
  return input.fallbackTab;
}

export function getWorkbenchHref(tab?: WorkbenchTab): string {
  if (!tab) return "/daa/dashboard/workbench";
  return `/daa/dashboard/workbench?tab=${tab}`;
}

export function shouldHandleWorkbenchAnchorClick(
  event: Pick<ReactMouseEvent<HTMLAnchorElement>, "defaultPrevented" | "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
): boolean {
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  return true;
}
