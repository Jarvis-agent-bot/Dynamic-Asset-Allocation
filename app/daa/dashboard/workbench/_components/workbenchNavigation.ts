import type { MouseEvent as ReactMouseEvent } from "react";

import { normalizeWorkbenchTab, type WorkbenchTab } from "@/app/daa/dashboard/_hooks/useWorkbenchModel";

export type WorkbenchSection = "cockpit" | "portfolio" | "rebalance" | "cash";

export function normalizeWorkbenchSection(input: string | null | undefined, fallbackTab: WorkbenchTab): WorkbenchSection {
  const text = String(input || "").trim().toLowerCase();
  if (text === "cockpit" || text === "portfolio" || text === "rebalance" || text === "cash") {
    return text;
  }
  if (fallbackTab === "rebalance") return "rebalance";
  if (fallbackTab === "cash") return "cash";
  return "portfolio";
}

export function getWorkbenchSectionForTab(tab: WorkbenchTab): WorkbenchSection {
  if (tab === "rebalance") return "rebalance";
  if (tab === "cash") return "cash";
  return "portfolio";
}

export function getWorkbenchTabForSection(input: {
  section: WorkbenchSection;
  searchTab: string | null | undefined;
  fallbackTab: WorkbenchTab;
}): WorkbenchTab {
  if (input.section === "rebalance") return "rebalance";
  if (input.section === "cash") return "cash";
  if (input.section === "portfolio") {
    return normalizeWorkbenchTab(
      input.searchTab || (input.fallbackTab === "watchlist" ? "watchlist" : "positions"),
    );
  }
  return input.fallbackTab;
}

export function shouldHandleWorkbenchAnchorClick(
  event: Pick<ReactMouseEvent<HTMLAnchorElement>, "defaultPrevented" | "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
): boolean {
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  return true;
}
