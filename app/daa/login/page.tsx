import DaaLoginClient from "./_components/DaaLoginClient";

export default function DaaLoginPage(props: { searchParams?: Record<string, string | string[] | undefined> }) {
  const rawReturnTo = props?.searchParams?.returnTo;
  const returnTo = typeof rawReturnTo === "string" ? rawReturnTo.trim() : "";

  const rawError = props?.searchParams?.error;
  const error = typeof rawError === "string" ? rawError.trim() : "";

  return <DaaLoginClient returnTo={returnTo || "/daa/dashboard"} error={error} />;
}
