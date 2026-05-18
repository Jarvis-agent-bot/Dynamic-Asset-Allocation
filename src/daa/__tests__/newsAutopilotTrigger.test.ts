import { describe, expect, it } from "vitest";

import { isActionableNewsForAutopilot } from "@/src/daa/automation/newsAutopilotTrigger";

describe("newsAutopilotTrigger", () => {
  it("high、medium 或警惕新闻都会进入每日一次的新闻 Autopilot 审核", () => {
    expect(isActionableNewsForAutopilot({ impact: "high" })).toBe(true);
    expect(isActionableNewsForAutopilot({ impact: "medium" })).toBe(true);
    expect(isActionableNewsForAutopilot({ actionHint: "警惕" })).toBe(true);
    expect(isActionableNewsForAutopilot({ impact: "low", actionHint: "关注" })).toBe(false);
  });
});
