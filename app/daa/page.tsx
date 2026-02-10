import { DaaWizard } from "./_components/DaaWizard";

type DaaPageProps = {
  searchParams?: {
    step?: string;
  };
};

export default function DaaConsoleHome({ searchParams }: DaaPageProps) {
  const stepId = Number(searchParams?.step);
  const initialStepId = Number.isFinite(stepId) ? Math.trunc(stepId) : undefined;

  return <DaaWizard initialStepId={initialStepId} />;
}
