import { redirect } from "next/navigation";

type Props = {
  searchParams?: Record<string, string | string[] | undefined>;
};

/**
 * /daa/dashboard → 按 tab 参数直接重定向到对应页面
 */
export default function DaaDashboardPage({ searchParams }: Props) {
  const tab = String(
    Array.isArray(searchParams?.tab)
      ? searchParams.tab[0]
      : searchParams?.tab ?? "",
  )
    .trim()
    .toLowerCase();

  if (tab === "positions" || tab === "watchlist") {
    redirect(`/daa/dashboard/portfolio?tab=${tab}`);
  }
  if (tab === "rebalance") {
    redirect("/daa/dashboard/rebalance");
  }

  // 默认进入投委会
  redirect("/daa/dashboard/today");
}
