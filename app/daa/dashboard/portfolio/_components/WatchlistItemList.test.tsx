// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildAssetUniverseView } from "@/src/daa/__tests__/testDataFactories";
import { WatchlistItemList } from "./WatchlistItemList";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/app/daa/dashboard/_hooks/useSparklines", () => ({
  useSparklines: () => ({}),
}));

vi.mock("@/app/daa/dashboard/_hooks/useFundamentals", () => ({
  useFundamentalsState: () => ({
    items: {},
    loading: false,
    error: null,
    requestedCount: 0,
    receivedCount: 0,
  }),
}));

vi.mock("@/app/daa/dashboard/_hooks/useTechnicalSignals", () => ({
  useTechnicalSignals: () => ({
    AAPL: {
      symbol: "AAPL",
      scorePct: 62,
      confidencePct: 70,
      momentumRegime: "neutral",
      metrics: {},
      specific: [],
      reasons: [],
    },
  }),
}));

afterEach(() => {
  cleanup();
  pushMock.mockClear();
});

describe("WatchlistItemList", () => {
  it("展示中文资产名并支持直接移出观察列表", () => {
    const onRemove = vi.fn();
    const row = buildAssetUniverseView({
      assetKey: "US::AAPL",
      symbol: "AAPL",
      displayNameZh: "苹果",
      name: "Apple Inc.",
      watchEnabled: true,
    });

    render(<WatchlistItemList rows={[row]} onRemoveFromWatchlist={onRemove} />);

    expect(screen.getByText("苹果")).toBeTruthy();
    expect(screen.getByText("AAPL")).toBeTruthy();
    expect(screen.getByText("评分 62")).toBeTruthy();
    expect(screen.getByText("中性动量")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "移出观察列表 苹果" }));

    expect(onRemove).toHaveBeenCalledWith(row);
    expect(pushMock).not.toHaveBeenCalled();
  });
});
