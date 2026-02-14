// DAA routing single-source-of-truth: `/daa/dashboard` is the canonical entry.
// Legacy `/daa*` URLs should redirect into it to avoid fragmented state and broken deep-links.

function parseSearchParams(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

function normalizePositiveInt(raw: unknown): number | null {
  const n = typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  return t > 0 ? t : null;
}

export type DaaDashboardCompatTab = "wizard" | "market-funds";

export function getDaaDashboardCompatRedirect(pathname: string, search: string): string | null {
  // Avoid redirect loops.
  if (pathname === "/daa/dashboard" || pathname === "/daa/dashboard/") return null;

  // Canonicalize legacy routes into `/daa/dashboard?...`.
  const params = parseSearchParams(search);

  // `/daa` and `/daa/` (including legacy wizard deep-links: `/daa?step=...`).
  if (pathname === "/daa" || pathname === "/daa/") {
    const step = normalizePositiveInt(params.get("step"));
    if (step) {
      params.set("tab", "wizard");
      params.set("step", String(step));
    }

    const qs = params.toString();
    return `/daa/dashboard${qs ? `?${qs}` : ""}`;
  }

  // `/daa/wizard` (and `/daa/wizard/step/:id`) -> wizard tab.
  const isWizardRoot = pathname === "/daa/wizard" || pathname === "/daa/wizard/";
  const wizardStepMatch = pathname.match(/^\/daa\/wizard\/step\/(\d+)\/?$/);
  if (isWizardRoot || wizardStepMatch) {
    const stepFromPath = wizardStepMatch ? normalizePositiveInt(wizardStepMatch[1]) : null;
    const stepFromQuery = normalizePositiveInt(params.get("step"));
    const step = stepFromPath ?? stepFromQuery ?? 1;

    params.set("tab", "wizard");
    params.set("step", String(step));

    const qs = params.toString();
    return `/daa/dashboard${qs ? `?${qs}` : ""}`;
  }

  // `/daa/step/:id` -> wizard tab.
  const stepMatch = pathname.match(/^\/daa\/step\/(\d+)\/?$/);
  if (stepMatch) {
    const step = normalizePositiveInt(stepMatch[1]) ?? 1;
    params.set("tab", "wizard");
    params.set("step", String(step));

    const qs = params.toString();
    return `/daa/dashboard${qs ? `?${qs}` : ""}`;
  }

  // `/daa/market/funds` -> market-funds tab.
  const isMarketFunds = pathname === "/daa/market/funds" || pathname === "/daa/market/funds/";
  if (isMarketFunds) {
    params.set("tab", "market-funds");
    const qs = params.toString();
    return `/daa/dashboard${qs ? `?${qs}` : ""}`;
  }

  return null;
}
