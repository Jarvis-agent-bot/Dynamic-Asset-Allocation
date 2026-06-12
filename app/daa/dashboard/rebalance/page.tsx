import { Suspense } from "react";
import { DaaSurfacePageHeader } from "../_components/DaaSurfaceUI";
import { WorkbenchLoadingState } from "../_components/WorkbenchFeedback";
import RebalancePageClient from "./_components/RebalancePageClient";

export default function RebalancePage() {
  return (
    <div className="space-y-4">
      <DaaSurfacePageHeader
        title="调仓"
        description="审阅建议并执行再平衡。"
      />
      <Suspense fallback={<WorkbenchLoadingState title="正在加载调仓工作台" description="同步市场环境与再平衡建议。" />}>
        <RebalancePageClient />
      </Suspense>
    </div>
  );
}
