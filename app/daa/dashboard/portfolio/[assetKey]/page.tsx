import { Suspense } from "react";
import { WorkbenchLoadingState } from "@/app/daa/dashboard/_components/WorkbenchFeedback";
import AssetTradingPageClient from "./_components/AssetTradingPageClient";

type Props = {
  params: { assetKey: string };
};

export default function AssetTradingPage({ params }: Props) {
  const assetKey = decodeURIComponent(params.assetKey);

  return (
    <Suspense fallback={<WorkbenchLoadingState title="正在加载资产详情" description="同步行情、持仓与交易面板。" />}>
      <AssetTradingPageClient assetKey={assetKey} />
    </Suspense>
  );
}
