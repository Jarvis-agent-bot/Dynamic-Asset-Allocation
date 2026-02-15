export function isProbablyInAppBrowserUserAgentV0(userAgent: string | null | undefined): boolean {
  const ua = (userAgent || "").trim();
  if (!ua) return false;

  const u = ua.toLowerCase();

  // Heuristics: lots of mobile apps embed a WebView which does not share cookies
  // with the users real browser. When a magic-link is opened there, the session
  // cookie may be set in the WebView only, leading to confusing "not signed in"
  // behavior when the user later opens the site in Safari/Chrome.
  const needles = [
    "fban", // Facebook
    "fbav",
    "instagram",
    "line/",
    "micromessenger", // WeChat
    "weibo",
    "qq/",
    "kakaotalk",
    "snapchat",
    "linkedinapp",
    "pinterest",
    "tiktok",
    "musical_ly",
    "telegram",
    "discord",
    "slack",
    "twitter",
  ];

  if (needles.some((n) => u.includes(n))) return true;

  // Android WebView often contains "; wv".
  if (u.includes("; wv")) return true;

  return false;
}
