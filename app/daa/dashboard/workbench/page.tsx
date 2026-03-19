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
        description="总览、组合、调仓和现金管理都放在这里处理。"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <DeepLedgerStatusPill tone="slate">不会自动下单</DeepLedgerStatusPill>
          </div>
        )}
      />
      <WorkbenchPageClient initialTab={searchParams?.tab} initialSection={searchParams?.section} />
    </div>
  );
}
