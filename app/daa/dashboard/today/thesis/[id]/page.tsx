import { Suspense } from "react";
import ThesisDetailClient from "./_components/ThesisDetailClient";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";

type Props = { params: { id: string } };

export default function ThesisDetailPage({ params }: Props) {
  const id = decodeURIComponent(params.id);
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <SectionErrorBoundary sectionName="Thesis Detail">
        <Suspense fallback={<div className="py-20 text-center text-sm text-[var(--muted)]">加载论点详情...</div>}>
          <ThesisDetailClient thesisId={id} />
        </Suspense>
      </SectionErrorBoundary>
    </div>
  );
}
