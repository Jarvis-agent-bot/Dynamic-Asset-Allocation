import { describe, expect, it } from "vitest";

import {
  FALLBACK_WORKBENCH_SECTION,
  WORKBENCH_SECTIONS,
  resolveWorkbenchSection,
} from "../workbenchSections";

describe("workbenchSections", () => {
  it("维护主导航所需的唯一工作站分区 key 与 href", () => {
    const keys = WORKBENCH_SECTIONS.map((section) => section.key);
    const hrefs = WORKBENCH_SECTIONS.map((section) => section.href);

    expect(keys).toEqual(["today", "portfolio", "rebalance", "trades", "strategy-lab", "settings"]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(WORKBENCH_SECTIONS.every((section) => section.label && section.shortLabel && section.hint)).toBe(true);
  });

  it("按 pathname 解析当前工作站分区", () => {
    expect(resolveWorkbenchSection("/daa/dashboard/today").key).toBe("today");
    expect(resolveWorkbenchSection("/daa/dashboard/portfolio").key).toBe("portfolio");
    expect(resolveWorkbenchSection("/daa/dashboard/rebalance").key).toBe("rebalance");
    expect(resolveWorkbenchSection("/daa/dashboard/trades").key).toBe("trades");
    expect(resolveWorkbenchSection("/daa/dashboard/strategy-lab").key).toBe("strategy-lab");
    expect(resolveWorkbenchSection("/daa/dashboard/settings").key).toBe("settings");
  });

  it("支持分区下钻页面仍高亮父级导航", () => {
    expect(resolveWorkbenchSection("/daa/dashboard/rebalance/indicator/vix").key).toBe("rebalance");
    expect(resolveWorkbenchSection("/daa/dashboard/portfolio/US::AAPL").key).toBe("portfolio");
    expect(resolveWorkbenchSection("/daa/dashboard/today/thesis/thesis_1").key).toBe("today");
  });

  it("未知路径回退到资产中枢元信息", () => {
    expect(resolveWorkbenchSection("/daa/dashboard")).toEqual(FALLBACK_WORKBENCH_SECTION);
    expect(resolveWorkbenchSection("/privacy")).toEqual(FALLBACK_WORKBENCH_SECTION);
  });
});
