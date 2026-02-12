export function getDaaWizardCompatRedirect(pathname: string, search: string): string | null {
  // Accept legacy wizard entrypoints and redirect them to the canonical Wizard URL.
  // Canonical URL is `/daa?step=...` (dashboard-first `/daa/` stays separate).
  const isWizardRoot = pathname === "/daa/wizard" || pathname === "/daa/wizard/";
  const stepPathMatch = pathname.match(/^\/daa\/wizard\/step\/(\d+)\/?$/);

  if (!isWizardRoot && !stepPathMatch) return null;

  let step = stepPathMatch ? Number(stepPathMatch[1]) : undefined;
  if (!Number.isFinite(step)) {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    step = Number(params.get("step"));
  }

  const normalizedStep = Number.isFinite(step) && step! > 0 ? Math.trunc(step!) : 1;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.set("step", String(normalizedStep));

  const qs = params.toString();
  return `/daa${qs ? `?${qs}` : ""}`;
}
