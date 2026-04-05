import { Suspense } from "react";
import IndicatorDetailClient from "./_components/IndicatorDetailClient";

type Props = { params: { key: string } };

export default function IndicatorDetailPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">正在加载…</div>}>
      <IndicatorDetailClient indicatorKey={decodeURIComponent(params.key)} />
    </Suspense>
  );
}
