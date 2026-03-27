import { DaaSurfacePageHeader } from "../_components/DaaSurfaceUI";
import TodayPageClient from "./_components/TodayPageClient";

export default function TodayPage() {
  return (
    <div className="space-y-6">
      <DaaSurfacePageHeader
        title="投委会"
        description="今日决策摘要 — 今天要不要动作？"
      />
      <TodayPageClient />
    </div>
  );
}
