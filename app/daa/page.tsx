import { redirect } from "next/navigation";

type DaaLegacyEntryProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function DaaLegacyEntry({ searchParams }: DaaLegacyEntryProps) {
  // `/daa` 作为产品主入口，统一收敛到控制台。
  const params = new URLSearchParams();

  for (const [k, v] of Object.entries(searchParams ?? {})) {
    if (typeof v === "undefined") continue;
    if (Array.isArray(v)) {
      for (const vv of v) params.append(k, vv);
    } else {
      params.append(k, v);
    }
  }

  const tab = params.get("tab");
  if (tab !== "settings" && tab !== "unified-core") {
    params.set("tab", "unified-core");
  }

  const qs = params.toString();
  redirect(`/daa/dashboard${qs ? `?${qs}` : ""}`);
}
