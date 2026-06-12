import { normalizePortfolioWorkbenchTab, type PortfolioWorkbenchTab } from "@/app/daa/dashboard/_hooks/useWorkbenchReadModel";

export function resolveTabFromLocation(input: {
  section: string | null | undefined;
  searchTab: string | null | undefined;
  fallbackTab: PortfolioWorkbenchTab;
}): PortfolioWorkbenchTab {
  const section = String(input.section || "").trim().toLowerCase();
  if (section === "portfolio") {
    return normalizePortfolioWorkbenchTab(
      input.searchTab || (input.fallbackTab === "watchlist" ? "watchlist" : "positions"),
    );
  }
  if (input.searchTab) {
    return normalizePortfolioWorkbenchTab(input.searchTab);
  }
  return input.fallbackTab;
}
