import { redirect } from "next/navigation";

export default function LegacyDaaStep2() {
  // Legacy entry: canonical step experience lives under /daa/dashboard.
  redirect("/daa/dashboard?tab=wizard&step=2");
}
