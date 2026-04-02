import { redirect } from "next/navigation";

type Props = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function DaaDashboardPage({ searchParams }: Props) {
  const tab = String(searchParams?.tab ?? "").trim().toLowerCase();
  const section = String(searchParams?.section ?? "").trim().toLowerCase();

  // 持仓/观察列表
  if (tab === "positions" || tab === "watchlist") {
    redirect(`/daa/dashboard/portfolio?tab=${tab}`);
  }

  // 调仓
  if (tab === "rebalance" || section === "rebalance") {
    redirect("/daa/dashboard/rebalance");
  }

  // 默认 → today
  const params = new URLSearchParams();
  if (section && section !== "cockpit") params.set("section", section);
  const qs = params.toString();
  redirect(`/daa/dashboard/today${qs ? `?${qs}` : ""}`);
}
