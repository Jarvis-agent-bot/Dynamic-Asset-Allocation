import { Suspense } from "react";
import TodayBriefingView from "./_components/TodayBriefingView";
import AssistantCommandPanel from "./_components/AssistantCommandPanel";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { TodayWorkbenchTabs } from "@/app/daa/dashboard/today/_components/TodayWorkbenchTabs";
import { WorkbenchLoadingState } from "@/app/daa/dashboard/_components/WorkbenchFeedback";

/** 今日工作台 — 汇总今天需要复核、追问或调整的组合事项。 */
export default function TodayPage() {
  return (
    <div className="w-full min-w-0">
      <TodayWorkbenchTabs />
      <SectionErrorBoundary sectionName="今日结论">
        <Suspense fallback={<WorkbenchLoadingState title="正在加载今日结论" description="同步复核优先级与待处理动作。" className="mt-3" />}>
          <TodayBriefingView />
        </Suspense>
      </SectionErrorBoundary>
      <SectionErrorBoundary sectionName="复核问答">
        <AssistantCommandPanel />
      </SectionErrorBoundary>
    </div>
  );
}
