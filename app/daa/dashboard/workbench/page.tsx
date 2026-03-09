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
        eyebrow="Execution Desk"
        title="工作台"
        description="在同一页面串联持仓、观察列表、资产发现与再平衡执行。主区负责操作，右侧决策栏负责检查与确认。"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <DeepLedgerStatusPill tone="cyan">人工确认下单</DeepLedgerStatusPill>
            <DeepLedgerStatusPill tone="slate">Auto trigger, manual execute</DeepLedgerStatusPill>
          </div>
        )}
      />
      <WorkbenchPageClient initialTab={searchParams?.tab} />
    </div>
  );
}
