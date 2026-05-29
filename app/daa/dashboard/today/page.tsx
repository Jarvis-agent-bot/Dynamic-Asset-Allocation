import { Suspense } from "react";
import AgentBriefingView from "./_components/AgentBriefingView";
import FloatingAssistantChat from "./_components/FloatingAssistantChat";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";

/** Agent 日报 — Cognitive Agent OS 的主入口 */
export default function TodayPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
      <SectionErrorBoundary sectionName="今日复核">
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
