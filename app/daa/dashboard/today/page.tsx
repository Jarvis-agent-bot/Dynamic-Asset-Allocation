import { Suspense } from "react";
import { DaaSurfacePageHeader } from "../_components/DaaSurfaceUI";
import TodayPageClient from "./_components/TodayPageClient";

type Props = {
  searchParams?: {
    tab?: string;
    section?: string;
  };
};

export default function TodayPage({ searchParams }: Props) {
  return (
    <div className="space-y-6">
      <DaaSurfacePageHeader
        title="投委会"
        description="决策摘要与组合操作 — 今天要不要动作？"
      />
      <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">正在加载…</div>}>
        <TodayPageClient initialTab={searchParams?.tab} initialSection={searchParams?.section} />
      </Suspense>
    </div>
  );
}
