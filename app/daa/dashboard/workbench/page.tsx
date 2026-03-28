import { redirect } from "next/navigation";

/**
 * /workbench → 按 tab 参数重定向到对应页面
 * 保留此路由避免旧链接 404。
 */
type Props = {
  searchParams?: {
    tab?: string;
    section?: string;
  };
};

export default function WorkbenchPage({ searchParams }: Props) {
  const tab = searchParams?.tab;

  // 持仓/观察列表 → /portfolio
  if (tab === "positions" || tab === "watchlist") {
    redirect(`/daa/dashboard/portfolio?tab=${tab}`);
  }

  // 调仓 → /rebalance
  if (tab === "rebalance") {
    redirect("/daa/dashboard/rebalance");
  }

  // 默认 → /today
  const params = new URLSearchParams();
  if (searchParams?.section) params.set("section", searchParams.section);
  const query = params.toString();
  redirect(`/daa/dashboard/today${query ? `?${query}` : ""}`);
}
