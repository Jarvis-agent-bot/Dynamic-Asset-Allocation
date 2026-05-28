import { Suspense } from "react";
import AgentBriefingView from "./_components/AgentBriefingView";
import AssistantChatPanel from "./_components/AssistantChatPanel";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";

/** Agent 日报 — Cognitive Agent OS 的主入口 */
export default function TodayPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_390px]">
      <main className="min-w-0">
        <SectionErrorBoundary sectionName="今日复核">
          <Suspense fallback={<div className="py-20 text-center text-sm text-[var(--muted)]">加载中...</div>}>
            <AgentBriefingView />
          </Suspense>
        </SectionErrorBoundary>
      </main>
      <aside className="min-w-0 lg:sticky lg:top-5 lg:self-start">
        <SectionErrorBoundary sectionName="Agent 对话">
          <AssistantChatPanel />
        </SectionErrorBoundary>
      </aside>
    </div>
  );
}
