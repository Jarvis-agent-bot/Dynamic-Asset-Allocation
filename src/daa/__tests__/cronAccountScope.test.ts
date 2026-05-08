import { afterEach, describe, expect, it, vi } from "vitest";

describe("cron-account-scope-v1", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("会按 active 账号逐个进入独立 scope 执行 cron", async () => {
    const enteredScopes: string[] = [];
    vi.doMock("@/src/daa/account/accountScope", () => ({
      listActiveDaaAccountScopes: vi.fn(async () => [
        { authAccountId: "acct-primary", username: "owner@example.com", scopeId: "default", isPrimary: true },
        { authAccountId: "acct-b", username: "b@example.com", scopeId: "acct-b", isPrimary: false },
      ]),
      withDaaAccountScope: vi.fn(async (scopeId: string, fn: () => Promise<unknown>) => {
        enteredScopes.push(scopeId);
        return fn();
      }),
    }));

    const { runForEachActiveDaaAccountScope, summarizeAccountScopedCronRuns } = await import("@/src/daa/cron/accountCronScope");

    const runs = await runForEachActiveDaaAccountScope(async (scope) => ({
      scopeId: scope.scopeId,
      user: scope.username,
    }));

    expect(enteredScopes).toEqual(["default", "acct-b"]);
    expect(runs).toHaveLength(2);
    expect(runs.every((run) => run.ok)).toBe(true);
    expect(summarizeAccountScopedCronRuns(runs)).toMatchObject({
      accountCount: 2,
      successCount: 2,
      failedCount: 0,
      results: [
        { ok: true, scopeId: "default", isPrimary: true },
        { ok: true, scopeId: "acct-b", isPrimary: false },
      ],
    });
  });

  it("为同一个外部幂等 key 生成账号级 key，避免账号之间互相挡住", async () => {
    vi.doMock("@/src/daa/account/accountScope", () => ({
      listActiveDaaAccountScopes: vi.fn(),
      withDaaAccountScope: vi.fn(),
    }));

    const { buildAccountScopedIdempotencyKey } = await import("@/src/daa/cron/accountCronScope");

    expect(buildAccountScopedIdempotencyKey({
      authAccountId: "acct-primary",
      username: "owner@example.com",
      scopeId: "default",
      isPrimary: true,
    }, "cron-slot-1")).toBe("default:cron-slot-1");
    expect(buildAccountScopedIdempotencyKey({
      authAccountId: "acct-b",
      username: "b@example.com",
      scopeId: "acct-b",
      isPrimary: false,
    }, "cron-slot-1")).toBe("acct-b:cron-slot-1");
  });

  it("没有外部 key 时按 UTC 调度窗口生成账号级默认幂等 key", async () => {
    vi.doMock("@/src/daa/account/accountScope", () => ({
      listActiveDaaAccountScopes: vi.fn(),
      withDaaAccountScope: vi.fn(),
    }));

    const {
      buildAccountScopedRequestIdempotencyKey,
      buildUtcCronWindowIdempotencyKey,
    } = await import("@/src/daa/cron/accountCronScope");
    const scope = {
      authAccountId: "acct-b",
      username: "b@example.com",
      scopeId: "acct-b",
      isPrimary: false,
    };
    const fallbackKey = buildUtcCronWindowIdempotencyKey(
      "cron_price_refresh",
      15,
      new Date("2026-05-08T10:22:45.000Z"),
    );

    expect(fallbackKey).toBe("cron_price_refresh:2026-05-08T10:15");
    expect(buildAccountScopedRequestIdempotencyKey(
      scope,
      new Request("http://localhost/api/daa/cron/price-refresh", { method: "POST" }),
      fallbackKey,
    )).toBe("acct-b:cron_price_refresh:2026-05-08T10:15");
    expect(buildAccountScopedRequestIdempotencyKey(
      scope,
      new Request("http://localhost/api/daa/cron/price-refresh", {
        method: "POST",
        headers: { "x-daa-force": "1" },
      }),
      fallbackKey,
    )).toBeNull();
  });
});
