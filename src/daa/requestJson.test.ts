import { describe, expect, it } from "vitest";

import { readJsonBody } from "./requestJson";

describe("readJsonBody", () => {
  it("rejects empty body", async () => {
    const req = new Request("http://example.test", { method: "POST", body: "   " });
    const res = await readJsonBody(req);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/empty/i);
  });

  it("rejects invalid JSON", async () => {
    const req = new Request("http://example.test", { method: "POST", body: "{bad" });
    const res = await readJsonBody(req);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/json/i);
  });

  it("parses valid JSON", async () => {
    const req = new Request("http://example.test", { method: "POST", body: "{\"a\":1}" });
    const res = await readJsonBody<{ a: number }>(req);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.a).toBe(1);
  });
});
