import { normalizeDashboardTab, type DashboardTab } from "@/app/daa/dashboard/_hooks/useDashboardModel";

export function resolveTabFromLocation(input: {
  section: string | null | undefined;
  searchTab: string | null | undefined;
  fallbackTab: DashboardTab;
}): DashboardTab {
  const section = String(input.section || "").trim().toLowerCase();
  if (section === "portfolio") {
    return normalizeDashboardTab(
      input.searchTab || (input.fallbackTab === "watchlist" ? "watchlist" : "positions"),
    );
  }
  if (input.searchTab) {
    return normalizeDashboardTab(input.searchTab);
  }
  return input.fallbackTab;
}
