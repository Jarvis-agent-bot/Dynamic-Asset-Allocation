import { redirect } from "next/navigation";

/** 投委会页面已合并至持仓页。保留路由以兼容旧链接。 */
export default function TodayPage() {
  redirect("/daa/dashboard/portfolio");
}
