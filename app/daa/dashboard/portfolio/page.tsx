import { Suspense } from "react";
import { DaaSurfacePageHeader } from "../_components/DaaSurfaceUI";
import PortfolioPageClient from "./_components/PortfolioPageClient";

type Props = {
  searchParams?: {
    tab?: string;
  };
};

export default function PortfolioPage({ searchParams }: Props) {
  return (
    <div className="space-y-6">
      <DaaSurfacePageHeader
        title="持仓"
        description="资产配置与观察列表管理"
      />
      <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">正在加载…</div>}>
        <PortfolioPageClient initialTab={searchParams?.tab} />
      </Suspense>
    </div>
  );
}
