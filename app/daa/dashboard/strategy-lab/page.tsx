import { redirect } from "next/navigation";

export default function StrategyLabPage() {
  redirect("/daa/dashboard/workbench?section=portfolio&tab=watchlist");
}
