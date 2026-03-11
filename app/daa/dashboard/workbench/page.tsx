import { DeepLedgerPageHeader, DeepLedgerStatusPill } from "../_components/DeepLedgerUI";

import WorkbenchPageClient from "./_components/WorkbenchPageClient";

type Props = {
  searchParams?: {
    tab?: string;
  };
};

export default function WorkbenchPage({ searchParams }: Props) {
  return (
    <div className="space-y-6">
      <DeepLedgerPageHeader
        eyebrow="执行工作台"
        title="工作台"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <DeepLedgerStatusPill tone="cyan">人工确认下单</DeepLedgerStatusPill>
          </div>
        )}
      />
      <WorkbenchPageClient initialTab={searchParams?.tab} />
    </div>
  );
}
