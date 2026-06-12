import { Suspense } from "react";

import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { TodayWorkbenchTabs } from "@/app/daa/dashboard/today/_components/TodayWorkbenchTabs";
import { WorkbenchLoadingState } from "@/app/daa/dashboard/_components/WorkbenchFeedback";
import AllocationDecisionJournalClient from "./_components/AllocationDecisionJournalClient";

/** 调仓记录 — 展示目标权重、人工拍板与审计记录。 */
export default function AllocationDecisionPage() {
  return (
    <div className="w-full min-w-0">
      <TodayWorkbenchTabs />
      <SectionErrorBoundary sectionName="调仓记录">
        <Suspense fallback={<WorkbenchLoadingState title="正在加载调仓记录" description="同步目标权重、拍板与审计记录。" className="mt-3" />}>
          <AllocationDecisionJournalClient />
        </Suspense>
      </SectionErrorBoundary>
    </div>
  );
}
