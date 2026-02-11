import { DaaWizard } from "../_components/DaaWizard";

type DaaWizardPageProps = {
  searchParams?: {
    step?: string;
  };
};

export default function DaaWizardPage({ searchParams }: DaaWizardPageProps) {
  const stepId = Number(searchParams?.step);
  const initialStepId = Number.isFinite(stepId) ? Math.trunc(stepId) : undefined;

  return <DaaWizard initialStepId={initialStepId} />;
}
