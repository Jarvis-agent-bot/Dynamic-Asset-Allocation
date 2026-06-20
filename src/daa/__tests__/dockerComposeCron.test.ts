import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("docker-compose cron system", () => {
  it("cron 使用摘要 wrapper 且重任务错峰，避免同分钟打满 daa-web", () => {
    const compose = readFileSync(join(root, "docker-compose.yml"), "utf8");

    expect(compose).toContain("daa-cron-curl");
    expect(compose).toContain("7,37 * * * * daa-cron-curl /api/daa/cron/news-refresh");
    expect(compose).toContain("17,47 * * * * daa-cron-curl /api/daa/cron/market-indicators-refresh");
    expect(compose).toContain("2 * * * * daa-cron-curl /api/daa/cron/daily-analysis");
    expect(compose).toContain("3 1,9 * * * daa-cron-curl /api/daa/cron/drift-check");
    expect(compose).toContain("23 * * * * daa-cron-curl /api/daa/cron/cognitive-agent");
    expect(compose).not.toContain("0 * * * * curl -sf");
    expect(compose).not.toContain("0 1,9 * * * curl -sf");
  });

  it(".dockerignore 排除本地构建缓存、密钥和 Git 元数据", () => {
    const dockerignore = readFileSync(join(root, ".dockerignore"), "utf8");

    for (const expected of ["node_modules", ".next", ".git", ".env", ".env.local", ".codex", ".gstack"]) {
      expect(dockerignore).toContain(expected);
    }
  });
});
