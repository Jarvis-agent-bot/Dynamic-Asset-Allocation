import { redirect } from "next/navigation";

type Props = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function DaaDashboardPage({ searchParams }: Props) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (typeof value === "undefined") continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else {
      params.append(key, value);
    }
  }
  if (!params.has("section")) {
    const tab = String(params.get("tab") || "").trim().toLowerCase();
    if (tab === "rebalance") params.set("section", "rebalance");
    else if (tab === "cash") params.set("section", "cash");
    else params.set("section", "cockpit");
  }
  const qs = params.toString();
  redirect(`/daa/dashboard/workbench${qs ? `?${qs}` : ""}`);
}
