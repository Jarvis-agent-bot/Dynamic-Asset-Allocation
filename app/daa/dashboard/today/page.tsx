import { Suspense } from "react";
import AgentBriefingView from "./_components/AgentBriefingView";
import FloatingAssistantChat from "./_components/FloatingAssistantChat";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { AgentSectionTabs } from "@/app/daa/dashboard/today/_components/AgentSectionTabs";

/** Agent 日报 — Cognitive Agent OS 的主入口 */
export default function TodayPage() {
  return (
    <div className="w-full min-w-0">
      <AgentSectionTabs />
      <SectionErrorBoundary sectionName="今日决策队列">
        <Suspense fallback={<div className="py-20 text-center text-sm text-[var(--muted)]">加载中...</div>}>
          <AgentBriefingView />
        </Suspense>
      </SectionErrorBoundary>
      <SectionErrorBoundary sectionName="Agent 对话">
        <FloatingAssistantChat />
      </SectionErrorBoundary>
    </div>
  );
}
