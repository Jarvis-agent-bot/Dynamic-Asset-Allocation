import { redirect } from "next/navigation";

/**
 * /workbench → /today 重定向
 * 工作台已融合进投委会页面，保留此路由避免旧链接 404。
 */
type Props = {
  searchParams?: {
    tab?: string;
    section?: string;
  };
};

export default function WorkbenchPage({ searchParams }: Props) {
  const params = new URLSearchParams();
  if (searchParams?.tab) params.set("tab", searchParams.tab);
  if (searchParams?.section) params.set("section", searchParams.section);
  const query = params.toString();
  redirect(`/daa/dashboard/today${query ? `?${query}` : ""}`);
}
