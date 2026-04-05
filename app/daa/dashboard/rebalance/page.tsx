import { Suspense } from "react";
import { DaaSurfacePageHeader } from "../_components/DaaSurfaceUI";
import RebalancePageClient from "./_components/RebalancePageClient";

export default function RebalancePage() {
  return (
    <div className="space-y-6">
      <DaaSurfacePageHeader
        title="调仓"
        description="查看市场环境，审阅建议并执行再平衡"
      />
      <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">正在加载…</div>}>
        <RebalancePageClient />
      </Suspense>
    </div>
  );
}
