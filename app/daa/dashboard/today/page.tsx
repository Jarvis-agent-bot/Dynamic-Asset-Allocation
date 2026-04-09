import { Suspense } from "react";
import AgentBriefingView from "./_components/AgentBriefingView";

/** Agent 日报 — Cognitive Agent OS 的主入口 */
export default function TodayPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <Suspense fallback={<div className="py-20 text-center text-sm text-[var(--muted)]">加载中...</div>}>
        <AgentBriefingView />
      </Suspense>
    </div>
  );
}
