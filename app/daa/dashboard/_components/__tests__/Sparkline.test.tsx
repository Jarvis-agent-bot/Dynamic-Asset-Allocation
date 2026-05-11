// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Sparkline } from "../Sparkline";

afterEach(() => {
  cleanup();
});

describe("Sparkline", () => {
  it("少于两个数据点时不渲染折线", () => {
    const { container } = render(<Sparkline data={[1]} />);

    expect(container.querySelector("svg")).toBeNull();
  });

  it("使用原生 SVG polyline 渲染迷你走势", () => {
    const { container } = render(<Sparkline data={[10, 20, 15]} width={60} height={20} color="red" />);
    const svg = container.querySelector("svg");
    const polyline = container.querySelector("polyline");

    expect(svg?.getAttribute("viewBox")).toBe("0 0 60 20");
    expect(polyline?.getAttribute("stroke")).toBe("red");
    expect(polyline?.getAttribute("points")).toBe("1.50,18.50 30.00,1.50 58.50,10.00");
  });
});
