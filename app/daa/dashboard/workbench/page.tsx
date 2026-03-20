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
        title="工作台"
        description="驾驶舱、组合、调仓和现金都在这里统一处理。"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <DeepLedgerStatusPill tone="green">支持聊天驱动模拟交易</DeepLedgerStatusPill>
          </div>
        )}
      />
      <WorkbenchPageClient initialTab={searchParams?.tab} initialSection={searchParams?.section} />
    </div>
  );
}
