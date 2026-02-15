import { redirect } from "next/navigation";

type StepPageProps = {
  params: {
    id: string;
  };
};

export default function LegacyDaaStep({ params }: StepPageProps) {
  // Legacy entry: canonical step experience lives under /daa/dashboard.
  const raw = String(params?.id || "");
  const n = Number(raw);
  const step = Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;

  if (!step) {
    redirect("/daa/dashboard?tab=wizard");
  }

  redirect(`/daa/dashboard?tab=wizard&step=${step}`);
}
