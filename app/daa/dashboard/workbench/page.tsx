import { DeepLedgerPageHeader, DeepLedgerStatusPill } from "../_components/DeepLedgerUI";

import WorkbenchPageClient from "./_components/WorkbenchPageClient";

type Props = {
  searchParams?: {
    tab?: string;
    section?: string;
  };
};

export default function WorkbenchPage({ searchParams }: Props) {
  return (
    <div className="space-y-6">
      <DeepLedgerPageHeader
        eyebrow="统一工作空间"
        title="工作台"
        description="总览已并入工作台。当前页面承担账户驾驶舱、组合构建、调仓执行与现金管理。"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <DeepLedgerStatusPill tone="cyan">单页工作流</DeepLedgerStatusPill>
            <DeepLedgerStatusPill tone="green">人工确认下单</DeepLedgerStatusPill>
          </div>
        )}
      />
      <WorkbenchPageClient initialTab={searchParams?.tab} initialSection={searchParams?.section} />
    </div>
  );
}
