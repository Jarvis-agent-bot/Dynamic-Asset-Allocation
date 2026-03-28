"use client";

import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { PortfolioRiskPanel } from "@/app/daa/dashboard/workbench/_components/PortfolioRiskPanel";
import { RebalanceRiskAlerts } from "@/app/daa/dashboard/workbench/_components/rebalance";
import type { DaaStoreEquitySnapshot } from "@/src/daa/store/storeTypes";
import type {
  PreTradeRiskCheck,
  RebalanceCycle,
  WorkbenchBootstrap,
} from "@/src/daa/modules/workbench/workbenchTypes";

export function WorkbenchRiskOverview(props: {
  bootstrap: WorkbenchBootstrap | null;
  snapshots: DaaStoreEquitySnapshot[];
  latestCycle: RebalanceCycle | null;
  currentRiskCheck: PreTradeRiskCheck | null;
}) {
  if (!props.bootstrap) return null;

  const hasTradeRiskIssue = props.currentRiskCheck && props.currentRiskCheck.overallStatus !== "pass";

  return (
    <div className="space-y-4">
      {/* 交易前风控告警（仅在有 warn/block 时显示）*/}
      {hasTradeRiskIssue && props.currentRiskCheck ? (
        <RebalanceRiskAlerts currentRiskCheck={props.currentRiskCheck} />
      ) : null}

      {/* 组合风险面板（HHI、最大仓位、回撤、漂移）*/}
      <SectionErrorBoundary sectionName="组合风险">
        <PortfolioRiskPanel
          bootstrap={props.bootstrap}
          snapshots={props.snapshots}
          latestCycle={props.latestCycle}
        />
      </SectionErrorBoundary>
    </div>
  );
}
