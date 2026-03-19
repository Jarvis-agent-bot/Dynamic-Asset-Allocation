// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkbenchActiveTabPanel } from "../WorkbenchActiveTabPanel";

afterEach(() => {
  cleanup();
});

vi.mock("../../../portfolio/_components/workbench/AssetUniverseTable", () => ({
  default: ({ view }: { view: string }) => <div data-testid={`asset-table-${view}`}>{view}</div>,
}));

vi.mock("../../../portfolio/_components/workbench/WatchlistBuilderPanel", () => ({
  default: () => <div data-testid="watchlist-builder">watchlist-builder</div>,
}));

vi.mock("../WorkbenchCashSection", () => ({
  WorkbenchCashSection: () => <div data-testid="cash-section">cash</div>,
}));

vi.mock("../WorkbenchRebalanceSection", () => ({
  WorkbenchRebalanceSection: ({ onNavigateTab }: { onNavigateTab: (tab: "positions" | "watchlist" | "rebalance" | "cash") => void }) => (
    <button type="button" data-testid="rebalance-go-watchlist" onClick={() => onNavigateTab("watchlist")}>
      go-watchlist
    </button>
  ),
}));

function createModel(overrides: Record<string, unknown> = {}) {
  return {
    activeTab: "watchlist",
    setActiveTab: vi.fn(),
    summary: {
      holdingAssets: 2,
      watchlistAssets: 5,
    },
    tableProps: {
      rows: [],
      baseCurrency: "USD",
      counts: { all: 0, holdings: 2, watchlist: 5, basket: 1 },
      onAddToExecution: vi.fn(),
      onUpdateTargetWeight: vi.fn(),
      onNormalizeTargetWeights: vi.fn(),
      onToggleBasket: vi.fn(),
      onRemoveFromWatchlist: vi.fn(),
      onOpenCalibration: vi.fn(),
      expandedInsightKeys: {},
      insightLoadingByAssetKey: {},
      insightErrorByAssetKey: {},
      insightDataByAssetKey: {},
      onToggleInlineInsights: vi.fn(),
      onSubmitLlmFeedback: vi.fn(),
      llmFeedbackSubmittingByContext: {},
      llmFeedbackScoreByContext: {},
    },
    watchlistBuilderProps: {
      joinedAssetKeys: {},
      onListFeaturedAssets: vi.fn(),
      onSearch: vi.fn(),
      onAddAsset: vi.fn(),
    },
    rebalanceSectionProps: {
      onNavigateTab: vi.fn(),
    },
    bootstrap: {
      baseCurrency: "USD",
    },
    loadBootstrap: vi.fn(),
    ...overrides,
  } as any;
}

describe("WorkbenchActiveTabPanel", () => {
  it("在组合页切换 tab 时优先走页面级导航回调", () => {
    const onNavigateTab = vi.fn();
    const model = createModel();

    render(<WorkbenchActiveTabPanel model={model} onNavigateTab={onNavigateTab} />);

    fireEvent.click(screen.getByRole("button", { name: "持仓 2" }));

    expect(onNavigateTab).toHaveBeenCalledWith("positions");
    expect(model.setActiveTab).not.toHaveBeenCalled();
  });

  it("观察列表先展示当前列表，再展示补充标的面板", () => {
    const model = createModel();

    render(<WorkbenchActiveTabPanel model={model} />);

    const table = screen.getAllByTestId("asset-table-watchlist")[0];
    fireEvent.click(screen.getByRole("button", { name: "展开观察池工具" }));
    const builder = screen.getByTestId("watchlist-builder");

    expect(Boolean(table.compareDocumentPosition(builder) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("观察列表异步加载后如果已有标的，会自动收起补充面板避免首屏过长", () => {
    const initialModel = createModel({
      summary: {
        holdingAssets: 0,
        watchlistAssets: 0,
      },
    });
    const { rerender } = render(<WorkbenchActiveTabPanel model={initialModel} />);

    expect(screen.getByTestId("watchlist-builder")).toBeTruthy();

    const loadedModel = createModel({
      summary: {
        holdingAssets: 2,
        watchlistAssets: 5,
      },
    });
    rerender(<WorkbenchActiveTabPanel model={loadedModel} />);

    expect(screen.queryByTestId("watchlist-builder")).toBeNull();
    expect(screen.getByRole("button", { name: "展开观察池工具" })).toBeTruthy();
  });

  it("调仓页的引导动作会复用页面级导航回调，而不是局部 setState", () => {
    const onNavigateTab = vi.fn();
    const localNavigate = vi.fn();
    const model = createModel({
      activeTab: "rebalance",
      rebalanceSectionProps: {
        onNavigateTab: localNavigate,
      },
    });

    render(<WorkbenchActiveTabPanel model={model} onNavigateTab={onNavigateTab} />);

    fireEvent.click(screen.getByTestId("rebalance-go-watchlist"));

    expect(onNavigateTab).toHaveBeenCalledWith("watchlist");
    expect(localNavigate).not.toHaveBeenCalled();
  });
});
