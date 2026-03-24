import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(file: string) {
  return fs.readFileSync(file, "utf8");
}

describe("dashboard-read-model-graph-v1", () => {
  it("workbench/trades 页面不再直接依赖旧读 API 组合函数", () => {
    const root = process.cwd();
    const files = [
      path.join(root, "app/daa/dashboard/workbench/_components/WorkbenchPageClient.tsx"),
      path.join(root, "app/daa/dashboard/trades/page.tsx"),
      path.join(root, "app/daa/dashboard/trades/_components/TradesPageClient.tsx"),
    ];

    const offenders = files
      .map((file) => ({ file, content: read(file) }))
      .filter(({ content }) => /listWorkbenchTradeRecords|listWorkbenchRebalanceReports|listWorkbenchRebalanceCycles/.test(content))
      .map(({ file }) => path.relative(root, file).replace(/\\/g, "/"));

    expect(offenders).toEqual([]);
  });
});
