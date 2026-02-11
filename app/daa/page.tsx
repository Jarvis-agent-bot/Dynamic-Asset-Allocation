import { redirect } from "next/navigation";

import { DaaWizard } from "./_components/DaaWizard";

type DaaPageProps = {
  searchParams?: {
    step?: string;
  };
};

export default function DaaConsoleHome({ searchParams }: DaaPageProps) {
  const stepId = Number(searchParams?.step);
  const initialStepId = Number.isFinite(stepId) ? Math.trunc(stepId) : undefined;

  // Make /daa/dashboard the default entry, but preserve existing deep-links like /daa?step=2.
  if (!initialStepId || initialStepId <= 0) {
    redirect("/daa/dashboard");
  }

  return <DaaWizard initialStepId={initialStepId} />;
}
