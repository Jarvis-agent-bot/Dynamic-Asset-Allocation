import type { DaaStoreRebalanceCycle } from "@/src/daa/store/daaStorePg";
import { WorkbenchDomainError, type WorkbenchDomainErrorCode } from "./workbenchErrors";
import type { RebalanceCycle } from "./workbenchTypes";

function isCycleTerminal(status: RebalanceCycle["status"] | DaaStoreRebalanceCycle["status"]): boolean {
  return status === "completed" || status === "cancelled";
}

function isCycleExecutable(status: RebalanceCycle["status"] | DaaStoreRebalanceCycle["status"]): boolean {
  return status === "generated" || status === "reviewing";
}

export function assertCycleMutable(cycle: {
  cycleId: string;
  status: RebalanceCycle["status"] | DaaStoreRebalanceCycle["status"];
}) {
  if (!isCycleTerminal(cycle.status)) return;
  throw new WorkbenchDomainError("CYCLE_IMMUTABLE", "该周期已终态，请生成新周期继续调仓。", {
    details: {
      cycleId: cycle.cycleId,
      cycleStatus: cycle.status,
    },
  });
}

export function assertCycleExecutable(cycle: {
  cycleId: string;
  status: RebalanceCycle["status"] | DaaStoreRebalanceCycle["status"];
}, actionLabel: "execute" | "summary") {
  if (isCycleExecutable(cycle.status)) return;
  const code: WorkbenchDomainErrorCode = actionLabel === "execute" && cycle.status === "completed"
    ? "CYCLE_ALREADY_COMPLETED"
    : "CYCLE_NOT_EXECUTABLE";
  const message = actionLabel === "execute"
    ? "该周期不可执行，请生成新周期继续调仓。"
    : "该周期不可生成执行摘要，请生成新周期继续调仓。";
  throw new WorkbenchDomainError(code, message, {
    details: {
      cycleId: cycle.cycleId,
      cycleStatus: cycle.status,
    },
  });
}
