export type DeployBootstrapCheckGroupV0 = "required" | "bootstrap" | "recommended" | "optional";

export type DeployBootstrapCheckV0 = {
  id: string;
  label: string;
  group: DeployBootstrapCheckGroupV0;
  ok: boolean;
  note?: string;
  candidates?: string[];
};

export type DeployStatusPayloadV0 = {
  ok: true;
  env: {
    nodeEnv: string;
    deployEnv: string;
    platform: string;
  };
  build: {
    sha: string;
    shaShort: string;
  };
  bootstrap: {
    checks: DeployBootstrapCheckV0[];
    missingRequired: string[];
    missingBootstrap: string[];
    missingRecommended: string[];
  };
  serverTime: string;
};

function isSet(v: unknown): boolean {
  return !!String(v ?? "").trim();
}

function envAnySet(env: Record<string, string | undefined>, names: string[]): boolean {
  for (const n of names) {
    if (isSet(env[n])) return true;
  }
  return false;
}

function isFastApiPublicDaaRoutesDisabledV0(env: Record<string, string | undefined>): boolean {
  return String(env.DAA_ENABLE_FASTAPI_PUBLIC_DAA_ROUTES ?? "0").trim() !== "1";
}

export function pickBuildShaV0(env: Record<string, string | undefined>): string {
  const candidates = [
    env.NEXT_PUBLIC_BUILD_SHA,
    env.DAA_BUILD_SHA,
    env.BUILD_SHA,
    env.VERCEL_GIT_COMMIT_SHA,
    env.GITHUB_SHA,
    env.CF_PAGES_COMMIT_SHA,
  ];

  for (const v of candidates) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }

  return "";
}

export function shortShaV0(sha: string): string {
  const s = String(sha ?? "").trim();
  if (!s) return "";
  return s.length > 10 ? s.slice(0, 10) : s;
}

function detectPlatformV0(env: Record<string, string | undefined>): string {
  return env.VERCEL
    ? "vercel"
    : env.CF_PAGES
      ? "cloudflare_pages"
      : env.RENDER
        ? "render"
        : env.FLY_APP_NAME
          ? "fly"
          : "unknown";
}

export function buildDeployBootstrapChecksV0(env: Record<string, string | undefined>): DeployBootstrapCheckV0[] {
  const checks: DeployBootstrapCheckV0[] = [];

  // Required for the app to function.
  checks.push({
    id: "DAA_DB_URL",
    label: "Postgres DB URL",
    group: "required",
    ok: envAnySet(env, ["DAA_DB_URL", "DATABASE_URL"]),
    candidates: ["DAA_DB_URL", "DATABASE_URL"],
    note: "Where the app should read/write the DAA store (Postgres preferred).",
  });


  // Required only on fresh deploy to create the first admin.
  checks.push({
    id: "DAA_AUTH_BOOTSTRAP_TOKEN",
    label: "Auth bootstrap token (fresh deploy)",
    group: "bootstrap",
    ok: isSet(env.DAA_AUTH_BOOTSTRAP_TOKEN),
    note: "Used to create the first admin account; can be removed after bootstrapping.",
  });

  // Recommended for clarity / UX.
  checks.push({
    id: "DAA_ENV",
    label: "Environment label",
    group: "recommended",
    ok: envAnySet(env, ["VERCEL_ENV", "DAA_ENV"]),
    candidates: ["VERCEL_ENV", "DAA_ENV"],
    note: "Shown in the dashboard to avoid operating in the wrong environment.",
  });

  checks.push({
    id: "BUILD_SHA",
    label: "Build SHA",
    group: "recommended",
    ok: envAnySet(env, [
      "NEXT_PUBLIC_BUILD_SHA",
      "DAA_BUILD_SHA",
      "BUILD_SHA",
      "VERCEL_GIT_COMMIT_SHA",
      "GITHUB_SHA",
      "CF_PAGES_COMMIT_SHA",
    ]),
    candidates: [
      "NEXT_PUBLIC_BUILD_SHA",
      "DAA_BUILD_SHA",
      "BUILD_SHA",
      "VERCEL_GIT_COMMIT_SHA",
      "GITHUB_SHA",
      "CF_PAGES_COMMIT_SHA",
    ],
    note: "Helps confirm what code is deployed; does not expose secrets.",
  });

  // Keep Next.js as the only public /api/daa owner.
  checks.push({
    id: "DAA_ENABLE_FASTAPI_PUBLIC_DAA_ROUTES",
    label: "FastAPI public /api/daa routes disabled",
    group: "recommended",
    ok: isFastApiPublicDaaRoutesDisabledV0(env),
    note: "Must stay 0 (or unset) so public /api/daa stays on Next.js.",
  });

  // Optional extras (not all deployments need these).
  checks.push({
    id: "DAA_ENGINE_BASE_URL",
    label: "Python engine base URL",
    group: "optional",
    ok: isSet(env.DAA_ENGINE_BASE_URL),
    note: "Needed only if some Step4/5 routes proxy to an external Python engine.",
  });

  checks.push({
    id: "DAA_PUBLIC_ORIGIN",
    label: "Public origin",
    group: "optional",
    ok: isSet(env.DAA_PUBLIC_ORIGIN),
    note: "Required for email login links / safe redirects (e.g. https://YOUR_DOMAIN).",
  });

  checks.push({
    id: "RESEND_API_KEY",
    label: "Resend API key",
    group: "optional",
    ok: isSet(env.RESEND_API_KEY),
    note: "Only needed for email login.",
  });

  checks.push({
    id: "DAA_AUTH_EMAIL_FROM",
    label: "Auth email from",
    group: "optional",
    ok: isSet(env.DAA_AUTH_EMAIL_FROM),
    note: "Only needed for email login.",
  });

  return checks;
}

export function buildDeployStatusPayloadV0(env: Record<string, string | undefined>, nowIso: string): DeployStatusPayloadV0 {
  const sha = pickBuildShaV0(env);
  const checks = buildDeployBootstrapChecksV0(env);

  const missingRequired = checks.filter((c) => c.group === "required" && !c.ok).map((c) => c.id);
  const missingBootstrap = checks.filter((c) => c.group === "bootstrap" && !c.ok).map((c) => c.id);
  const missingRecommended = checks.filter((c) => c.group === "recommended" && !c.ok).map((c) => c.id);

  return {
    ok: true,
    env: {
      nodeEnv: env.NODE_ENV ?? "",
      deployEnv: env.VERCEL_ENV ?? env.DAA_ENV ?? "",
      platform: detectPlatformV0(env),
    },
    build: {
      sha,
      shaShort: shortShaV0(sha),
    },
    bootstrap: {
      checks,
      missingRequired,
      missingBootstrap,
      missingRecommended,
    },
    serverTime: nowIso,
  };
}
