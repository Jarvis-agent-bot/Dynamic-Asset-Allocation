import { redirect } from "next/navigation";

type DaaLegacyEntryProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function firstString(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default function DaaLegacyEntry({ searchParams }: DaaLegacyEntryProps) {
  // Legacy entrypoint: keep `/daa` working, but always funnel into the canonical
  // `/daa/dashboard` URL to avoid fragmented state.
  const params = new URLSearchParams();

  for (const [k, v] of Object.entries(searchParams ?? {})) {
    if (typeof v === "undefined") continue;
    if (Array.isArray(v)) {
      for (const vv of v) params.append(k, vv);
    } else {
      params.append(k, v);
    }
  }

  const stepRaw = firstString(searchParams?.step);
  const stepNum = stepRaw ? Number(stepRaw) : NaN;
  const step = Number.isFinite(stepNum) && stepNum > 0 ? Math.trunc(stepNum) : null;

  if (step) {
    params.set("tab", "wizard");
    params.set("step", String(step));
  } else {
    // Drop invalid legacy step values.
    params.delete("step");
  }

  const qs = params.toString();
  redirect(`/daa/dashboard${qs ? `?${qs}` : ""}`);
}
