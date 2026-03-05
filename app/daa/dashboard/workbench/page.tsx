import { PageHeader } from "@/components/ui/page-header";

import WorkbenchPageClient from "./_components/WorkbenchPageClient";

type Props = {
  searchParams?: {
    tab?: string;
  };
};

export default function WorkbenchPage({ searchParams }: Props) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="工作台"
        description="在同一页面管理持仓、观察列表、资产发现和再平衡周期。"
      />
      <WorkbenchPageClient initialTab={searchParams?.tab} />
    </div>
  );
}
