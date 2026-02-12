import { redirect } from "next/navigation";

type DaaWizardCompatPageProps = {
  searchParams?: {
    step?: string;
  };
};

export default function DaaWizardCompatPage({ searchParams }: DaaWizardCompatPageProps) {
  const stepId = Number(searchParams?.step);
  const initialStepId = Number.isFinite(stepId) ? Math.trunc(stepId) : undefined;

  // Compatibility route: keep old `/daa/wizard` links working, but avoid fragmenting URLs.
  // Canonical wizard URL is `/daa?step=...` (and `/daa/` remains dashboard-first).
  redirect(`/daa?step=${initialStepId && initialStepId > 0 ? initialStepId : 1}`);
}
