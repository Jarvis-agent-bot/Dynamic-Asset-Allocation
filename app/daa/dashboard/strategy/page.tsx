import { redirect } from "next/navigation";

export default function StrategyRedirectPage() {
  redirect("/daa/dashboard/strategy-lab?tab=strategy");
}
