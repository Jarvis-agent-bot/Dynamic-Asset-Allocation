import { Suspense } from "react";
import MemoryBrowserClient from "./_components/MemoryBrowserClient";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";

export default function MemoriesPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <SectionErrorBoundary sectionName="Memory Browser">
        <Suspense fallback={<div className="py-20 text-center text-sm text-[var(--muted)]">加载记忆...</div>}>
          <MemoryBrowserClient />
        </Suspense>
      </SectionErrorBoundary>
    </div>
  );
}
