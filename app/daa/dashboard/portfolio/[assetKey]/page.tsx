import { Suspense } from "react";
import AssetTradingPageClient from "./_components/AssetTradingPageClient";

type Props = {
  params: { assetKey: string };
};

export default function AssetTradingPage({ params }: Props) {
  const assetKey = decodeURIComponent(params.assetKey);

  return (
    <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">正在加载…</div>}>
      <AssetTradingPageClient assetKey={assetKey} />
    </Suspense>
  );
}
