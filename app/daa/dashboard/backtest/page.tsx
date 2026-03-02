import { redirect } from "next/navigation";

export default function BacktestRedirectPage() {
  redirect("/daa/dashboard/strategy-lab?tab=backtest");
}
