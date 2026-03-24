import { DaaSurfacePageHeader } from "../_components/DaaSurfaceUI";

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
      <DaaSurfacePageHeader
        title="工作台"
        description="账户概览、风险信号、组合操作、调仓执行和现金流水都收在这里。"
      />
      <WorkbenchPageClient initialTab={searchParams?.tab} initialSection={searchParams?.section} />
    </div>
  );
}
