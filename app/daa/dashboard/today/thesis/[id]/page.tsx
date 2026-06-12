import { Suspense } from "react";
import InvestmentJudgmentDetailClient from "./_components/InvestmentJudgmentDetailClient";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { WorkbenchLoadingState } from "@/app/daa/dashboard/_components/WorkbenchFeedback";

type Props = { params: { id: string } };

export default function InvestmentJudgmentDetailPage({ params }: Props) {
  const id = decodeURIComponent(params.id);
  return (
    <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
      <SectionErrorBoundary sectionName="投资判断">
        <Suspense fallback={<WorkbenchLoadingState title="正在加载投资判断" description="同步复核依据与复核历史。" />}>
          <InvestmentJudgmentDetailClient judgmentId={id} />
        </Suspense>
      </SectionErrorBoundary>
    </div>
  );
}
