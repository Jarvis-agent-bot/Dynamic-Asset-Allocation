import { redirect } from "next/navigation";

type DaaLegacyEntryProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function DaaLegacyEntry({ searchParams }: DaaLegacyEntryProps) {
  // `/daa` 统一收敛到唯一控制台入口。
  const params = new URLSearchParams();

  for (const [k, v] of Object.entries(searchParams ?? {})) {
    if (k === "tab") continue;
    if (typeof v === "undefined") continue;
    if (Array.isArray(v)) {
      for (const vv of v) params.append(k, vv);
    } else {
      params.append(k, v);
    }
  }

  const qs = params.toString();
  redirect(`/daa/dashboard${qs ? `?${qs}` : ""}`);
}
