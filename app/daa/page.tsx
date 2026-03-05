import { redirect } from "next/navigation";

type DaaEntryProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function DaaEntry({ searchParams }: DaaEntryProps) {
  // `/daa` 统一收敛到资产首页入口。
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
