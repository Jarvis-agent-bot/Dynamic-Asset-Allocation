import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickSha(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_BUILD_SHA,
    process.env.DAA_BUILD_SHA,
    process.env.BUILD_SHA,
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.GITHUB_SHA,
    process.env.CF_PAGES_COMMIT_SHA,
  ];

  for (const v of candidates) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }

  return "";
}

function shortSha(sha: string): string {
  const s = String(sha ?? "").trim();
  if (!s) return "";
  return s.length > 10 ? s.slice(0, 10) : s;
}

export async function GET() {
  const sha = pickSha();

  // Keep the payload intentionally small; this is shown in the dashboard.
  return NextResponse.json(
    {
      ok: true,
      env: {
        nodeEnv: process.env.NODE_ENV ?? "",
        deployEnv: process.env.VERCEL_ENV ?? process.env.DAA_ENV ?? "",
        platform: process.env.VERCEL
          ? "vercel"
          : process.env.CF_PAGES
            ? "cloudflare_pages"
            : process.env.RENDER
              ? "render"
              : process.env.FLY_APP_NAME
                ? "fly"
                : "unknown",
      },
      build: {
        sha,
        shaShort: shortSha(sha),
      },
      serverTime: new Date().toISOString(),
    },
    {
      headers: {
        // Avoid stale build info after redeploys.
        "cache-control": "no-store",
      },
    },
  );
}
