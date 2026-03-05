import { PageHeader } from "@/components/ui/page-header";

import WorkbenchPageClient from "./_components/workbench/WorkbenchPageClient";

type Props = {
  searchParams?: {
    view?: string;
  };
};

export default function PortfolioPage({ searchParams }: Props) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="交易工作台"
        description="资产发现、洞察分析、建议与执行、回执追溯全部在同一页面完成。"
      />
      <WorkbenchPageClient initialView={searchParams?.view} />
    </div>
  );
}
