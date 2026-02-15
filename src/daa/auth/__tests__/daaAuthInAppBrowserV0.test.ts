import { describe, expect, it } from "vitest";

import { isProbablyInAppBrowserUserAgentV0 } from "../daaAuthInAppBrowserV0";

describe("isProbablyInAppBrowserUserAgentV0", () => {
  it("returns false for empty", () => {
    expect(isProbablyInAppBrowserUserAgentV0("")).toBe(false);
    expect(isProbablyInAppBrowserUserAgentV0(null)).toBe(false);
    expect(isProbablyInAppBrowserUserAgentV0(undefined)).toBe(false);
  });

  it("returns false for normal Safari and Chrome", () => {
    const safariIOS =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";
    const chromeAndroid =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36";

    expect(isProbablyInAppBrowserUserAgentV0(safariIOS)).toBe(false);
    expect(isProbablyInAppBrowserUserAgentV0(chromeAndroid)).toBe(false);
  });

  it("detects common in-app browsers", () => {
    expect(isProbablyInAppBrowserUserAgentV0("FBAN/FBIOS FBAV/123.0.0.1")).toBe(true);
    expect(isProbablyInAppBrowserUserAgentV0("Instagram 300.0.0.0.0")).toBe(true);
    expect(isProbablyInAppBrowserUserAgentV0("MicroMessenger/8.0.0")).toBe(true);
    expect(isProbablyInAppBrowserUserAgentV0("TelegramBot (like Twitter)")).toBe(true);
  });

  it("detects Android WebView marker", () => {
    const webView =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/121.0.0.0 Mobile Safari/537.36";
    expect(isProbablyInAppBrowserUserAgentV0(webView)).toBe(true);
  });
});
