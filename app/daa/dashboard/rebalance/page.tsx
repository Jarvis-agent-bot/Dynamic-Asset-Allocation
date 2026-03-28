import { Suspense } from "react";
import { DaaSurfacePageHeader } from "../_components/DaaSurfaceUI";
import RebalancePageClient from "./_components/RebalancePageClient";

export default function RebalancePage() {
  return (
    <div className="space-y-6">
      <DaaSurfacePageHeader
        title="调仓"
        description="再平衡工作流 — 检测、生成、审阅、执行"
      />
      <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">正在加载…</div>}>
        <RebalancePageClient />
      </Suspense>
    </div>
  );
}
