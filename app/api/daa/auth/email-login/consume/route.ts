import { NextResponse } from "next/server";

import { DAA_AUTH_SESSION_COOKIE_PATH_V0, DAA_AUTH_SESSION_COOKIE_V0 } from "@/src/daa/auth/daaAuthConstantsV0";
import { isProbablyInAppBrowserUserAgentV0 } from "@/src/daa/auth/daaAuthInAppBrowserV0";
import { consumeDaaAuthEmailLoginTokenWithReasonV0 } from "@/src/daa/auth/daaAuthEmailLoginStoreV0";
import { getClientIpFromRequestV0, getUserAgentFromRequestV0 } from "@/src/daa/auth/daaAuthRequestV0";
import { normalizeDaaReturnToV0 } from "@/src/daa/urlV0";

export const runtime = "nodejs";

// returnTo normalization is shared via src/daa/urlV0.ts

function escapeHtmlV0(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function renderSignedInHintHtmlV0(opts: { targetUrl: string; showInAppHint: boolean }): string {
  const safeUrl = escapeHtmlV0(opts.targetUrl);
  const hint = opts.showInAppHint
    ? "It looks like this link was opened inside an in-app browser. If you plan to use the dashboard in Safari or Chrome, open the dashboard there to reuse the session."
    : "You are signed in. Continue to the dashboard.";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Signed in</title>
    <style>
      :root { color-scheme: light dark; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; margin: 0; padding: 24px; }
      .card { max-width: 520px; margin: 0 auto; border: 1px solid rgba(127,127,127,0.25); border-radius: 12px; padding: 16px; }
      h1 { font-size: 18px; margin: 0 0 10px; }
      p { margin: 0 0 14px; line-height: 1.4; opacity: 0.9; }
      .actions { display: flex; gap: 10px; flex-wrap: wrap; }
      .btn { display: inline-block; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(127,127,127,0.35); text-decoration: none; font-weight: 600; }
      .btn-primary { background: #2563eb; color: #fff; border-color: rgba(37,99,235,0.8); }
      .btn-secondary { background: transparent; color: inherit; }
      .small { margin-top: 10px; font-size: 12px; opacity: 0.75; word-break: break-all; }
    </style>
  </head>
  <body>
    <div class="card" data-url="${safeUrl}">
      <h1>Signed in</h1>
      <p>${escapeHtmlV0(hint)}</p>
      <div class="actions">
        <a class="btn btn-primary" href="${safeUrl}">Open dashboard</a>
        <button class="btn btn-secondary" id="copy" type="button">Copy dashboard link</button>
      </div>
      <div class="small" id="status">${safeUrl}</div>
    </div>
    <script>
      (function () {
        var card = document.querySelector(".card");
        var url = card ? card.getAttribute("data-url") : "";
        var btn = document.getElementById("copy");
        var status = document.getElementById("status");

        function setStatus(msg) {
          if (status) status.textContent = msg;
        }

        async function copy() {
          try {
            if (!url) throw new Error("missing-url");
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(url);
              setStatus("Copied. Now open this link in Safari or Chrome.");
              return;
            }

            var ta = document.createElement("textarea");
            ta.value = url;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            var ok = document.execCommand("copy");
            document.body.removeChild(ta);
            setStatus(ok ? "Copied. Now open this link in Safari or Chrome." : "Copy failed. You can manually select the link and copy.");
          } catch (e) {
            setStatus("Copy failed. You can manually select the link and copy.");
          }
        }

        if (btn) btn.addEventListener("click", copy);
      })();
    </script>
  </body>
</html>`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const returnTo = normalizeDaaReturnToV0(url.searchParams.get("returnTo"));

  const ua = getUserAgentFromRequestV0(req) || null;
  const ip = getClientIpFromRequestV0(req) || null;

  const found = await consumeDaaAuthEmailLoginTokenWithReasonV0({ token, userAgent: ua, ip });
  if (!found.ok) {
    const loginUrl = new URL("/daa/login", url);
    const err = found.error === "used" ? "email-link-used" : found.error === "expired" ? "email-link-expired" : "email-link-invalid";
    loginUrl.searchParams.set("error", err);
    loginUrl.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(loginUrl, 302);
  }

  const target = new URL(returnTo, url);
  if (!target.searchParams.get("notice")) target.searchParams.set("notice", "signed_in");

  const showInAppHint = isProbablyInAppBrowserUserAgentV0(ua);

  if (showInAppHint) {
    const html = renderSignedInHintHtmlV0({ targetUrl: target.toString(), showInAppHint });
    const res = new NextResponse(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });

    res.cookies.set({
      name: DAA_AUTH_SESSION_COOKIE_V0,
      value: found.sessionToken,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: DAA_AUTH_SESSION_COOKIE_PATH_V0,
      expires: new Date(found.session.expiresAt),
    });

    return res;
  }

  const res = NextResponse.redirect(target, 302);
  res.headers.set("cache-control", "no-store");
  res.cookies.set({
    name: DAA_AUTH_SESSION_COOKIE_V0,
    value: found.sessionToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: DAA_AUTH_SESSION_COOKIE_PATH_V0,
    expires: new Date(found.session.expiresAt),
  });

  return res;
}
