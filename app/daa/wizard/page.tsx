import { redirect } from "next/navigation";

type DaaWizardCompatPageProps = {
  searchParams?: {
    step?: string;
  };
};

export default function DaaWizardCompatPage({ searchParams }: DaaWizardCompatPageProps) {
  const stepId = Number(searchParams?.step);
  const step = Number.isFinite(stepId) && stepId > 0 ? Math.trunc(stepId) : 1;

  // Compatibility route: keep old `/daa/wizard` links working, but avoid fragmenting URLs.
  // Canonical wizard URL is `/daa/dashboard?tab=wizard&step=...`.
  redirect(`/daa/dashboard?tab=wizard&step=${step}`);
}
