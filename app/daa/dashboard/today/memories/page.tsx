import { Suspense } from "react";
import MemoryBrowserClient from "./_components/MemoryBrowserClient";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { AgentSectionTabs } from "@/app/daa/dashboard/today/_components/AgentSectionTabs";

export default function MemoriesPage() {
  return (
    <div className="w-full min-w-0">
      <AgentSectionTabs />
      <SectionErrorBoundary sectionName="Memory Browser">
        <Suspense fallback={<div className="py-20 text-center text-sm text-[var(--muted)]">加载记忆...</div>}>
          <div className="mx-auto max-w-4xl">
            <MemoryBrowserClient />
          </div>
        </Suspense>
      </SectionErrorBoundary>
    </div>
  );
}
