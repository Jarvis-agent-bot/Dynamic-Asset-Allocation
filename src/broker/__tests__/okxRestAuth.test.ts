import { describe, expect, it } from "vitest";

import { buildOkxRestAuthHeaders, signOkxRestRequest } from "../okxRestAuth";

describe("broker/okxRestAuth", () => {
  it("signs request using OKX prehash format (timestamp+method+path+body)", () => {
    const sign = signOkxRestRequest({
      creds: { apiKey: "k", apiSecret: "testsecret", passphrase: "p" },
      timestamp: "2026-02-13T00:00:00.000Z",
      method: "GET",
      requestPathWithQuery: "/api/v5/account/balance?ccy=USDT,BTC",
      body: "",
    });

    expect(sign).toBe("QPZt7LENsnwGuCuZ4Jdewj0P7bs9PYMbmJPmZvaae+k=");
  });

  it("builds OKX REST auth headers", () => {
    const headers = buildOkxRestAuthHeaders({
      creds: { apiKey: "API_KEY", apiSecret: "testsecret", passphrase: "PASS" },
      timestamp: "2026-02-13T00:00:00.000Z",
      method: "GET",
      requestPathWithQuery: "/api/v5/account/balance",
    });

    expect(headers["OK-ACCESS-KEY"]).toBe("API_KEY");
    expect(headers["OK-ACCESS-PASSPHRASE"]).toBe("PASS");
    expect(headers["OK-ACCESS-TIMESTAMP"]).toBe("2026-02-13T00:00:00.000Z");
    expect(typeof headers["OK-ACCESS-SIGN"]).toBe("string");
    expect(headers.accept).toBe("application/json");
  });
});
