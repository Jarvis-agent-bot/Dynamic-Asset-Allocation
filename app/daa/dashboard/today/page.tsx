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
      <TodayPageClient initialTab={searchParams?.tab} initialSection={searchParams?.section} />
    </div>
  );
}
