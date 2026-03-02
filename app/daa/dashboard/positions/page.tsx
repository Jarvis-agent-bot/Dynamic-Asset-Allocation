import { redirect } from "next/navigation";

export default function PositionsRedirectPage() {
  redirect("/daa/dashboard/portfolio?tab=positions");
}
