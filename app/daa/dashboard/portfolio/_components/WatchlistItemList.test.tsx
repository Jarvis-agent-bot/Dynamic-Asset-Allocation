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

    fireEvent.click(screen.getByRole("button", { name: "移出观察列表 苹果" }));

    expect(onRemove).toHaveBeenCalledWith(row);
    expect(pushMock).not.toHaveBeenCalled();
  });
});
