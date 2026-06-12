import { Suspense } from "react";
import ExperienceLibraryClient from "./_components/ExperienceLibraryClient";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { TodayWorkbenchTabs } from "@/app/daa/dashboard/today/_components/TodayWorkbenchTabs";
import { WorkbenchLoadingState } from "@/app/daa/dashboard/_components/WorkbenchFeedback";

export default function ExperienceLibraryPage() {
  return (
    <div className="w-full min-w-0">
      <TodayWorkbenchTabs />
      <SectionErrorBoundary sectionName="经验库">
        <Suspense fallback={<WorkbenchLoadingState title="正在加载经验记录" description="同步历史复核结论与可复用经验。" className="mt-3" />}>
          <ExperienceLibraryClient />
        </Suspense>
      </SectionErrorBoundary>
    </div>
  );
}
