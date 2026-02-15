import { redirect } from "next/navigation";

export default function LegacyDaaStep7() {
  // Legacy entry: canonical step experience lives under /daa/dashboard.
  redirect("/daa/dashboard?tab=wizard&step=7");
}
