import { Suspense } from "react";
import { DaaSurfacePageHeader } from "../_components/DaaSurfaceUI";
import { WorkbenchLoadingState } from "../_components/WorkbenchFeedback";
import PortfolioPageClient from "./_components/PortfolioPageClient";

type Props = {
  searchParams?: {
    tab?: string;
  };
};

export default function PortfolioPage({ searchParams }: Props) {
  return (
    <div className="space-y-4">
      <DaaSurfacePageHeader
        eyebrow="资产首页"
        title="资产中枢"
        description="现金、持仓、观察列表与调仓建议在这里汇合。"
      />
      <Suspense fallback={<WorkbenchLoadingState title="正在加载资产中枢" description="同步持仓、现金与观察列表。" />}>
        <PortfolioPageClient initialTab={searchParams?.tab} />
      </Suspense>
    </div>
  );
}
