import { Suspense } from "react";
import { WorkbenchLoadingState } from "@/app/daa/dashboard/_components/WorkbenchFeedback";
import IndicatorDetailClient from "./_components/IndicatorDetailClient";

type Props = { params: { key: string } };

export default function IndicatorDetailPage({ params }: Props) {
  return (
    <Suspense fallback={<WorkbenchLoadingState title="正在加载指标详情" description="同步指标序列与分位分布。" />}>
      <IndicatorDetailClient indicatorKey={decodeURIComponent(params.key)} />
    </Suspense>
  );
}
