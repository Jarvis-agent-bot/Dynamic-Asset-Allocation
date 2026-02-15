import { redirect } from "next/navigation";

type LegacyMarketFundsProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function LegacyMarketFunds({ searchParams }: LegacyMarketFundsProps) {
  // Legacy entry: always funnel into the canonical dashboard route.
  const params = new URLSearchParams();

  for (const [k, v] of Object.entries(searchParams ?? {})) {
    if (typeof v === "undefined") continue;
    if (Array.isArray(v)) {
      for (const vv of v) params.append(k, vv);
    } else {
      params.append(k, v);
    }
  }

  params.set("tab", "market-funds");

  const qs = params.toString();
  redirect(`/daa/dashboard${qs ? `?${qs}` : ""}`);
}
