import DaaLoginClient from "./_components/DaaLoginClient";

export default function DaaLoginPage(props: { searchParams?: Record<string, string | string[] | undefined> }) {
  const raw = props?.searchParams?.returnTo;
  const returnTo = typeof raw === "string" ? raw.trim() : "";

  return <DaaLoginClient returnTo={returnTo || "/daa/dashboard"} />;
}
