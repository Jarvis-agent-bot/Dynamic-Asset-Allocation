import { Suspense } from "react";

import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { AgentSectionTabs } from "@/app/daa/dashboard/today/_components/AgentSectionTabs";
import AgentDecisionJournalClient from "./_components/AgentDecisionJournalClient";

/** Agent 决策记录 — 展示目标权重与推理审计 */
export default function AgentDecisionsPage() {
  return (
    <div className="w-full min-w-0">
      <AgentSectionTabs />
      <SectionErrorBoundary sectionName="Agent 决策记录">
        <Suspense fallback={<div className="py-20 text-center text-sm text-[var(--muted)]">加载中...</div>}>
          <AgentDecisionJournalClient />
        </Suspense>
      </SectionErrorBoundary>
    </div>
  );
}
