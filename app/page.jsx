import { redirect } from "next/navigation";

export default function Home() {
  // DAA is the primary entrypoint.
  redirect("/daa/");
}
