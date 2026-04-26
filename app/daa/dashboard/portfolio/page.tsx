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
        eyebrow="资产首页"
        title="资产中枢"
        description="现金、持仓、观察列表与调仓建议在这里汇合。"
      />
      <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">正在加载…</div>}>
        <PortfolioPageClient initialTab={searchParams?.tab} />
      </Suspense>
    </div>
  );
}
