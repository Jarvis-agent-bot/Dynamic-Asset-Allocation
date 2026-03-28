/**
 * workflowSteps.ts
 *
 * 调仓工作流状态机 — 纯函数，无副作用。
 * 从 rebalanceSectionProps 派生当前步骤。
 *
 * 五步流程：检测 → 生成 → 审阅 → 风控门禁 → 执行
 */

import type { PreTradeRiskCheck, RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";

export type WorkflowStep = "idle" | "detect" | "generate" | "review" | "risk_gate" | "execute" | "complete";

export type WorkflowStepMeta = {
  step: WorkflowStep;
  /** 步骤序号 (1-5)，idle/complete 为 0 */
  index: number;
  /** 一句话状态说明 */
  label: string;
  /** 详细说明 */
  hint: string;
};

const STEP_INDEX: Record<WorkflowStep, number> = {
  idle: 0,
  detect: 1,
  generate: 2,
  review: 3,
  risk_gate: 4,
  execute: 5,
  complete: 0,
};

export function deriveWorkflowStep(input: {
  currentCycle: RebalanceCycle | null;
  currentRiskCheck: PreTradeRiskCheck | null;
  driftCount: number;
  selectedProposalCount: number;
  isCurrentCycleTerminal: boolean;
  rebalanceChecklistAllPassed: boolean;
  busy: boolean;
}): WorkflowStepMeta {
  const { currentCycle, currentRiskCheck, driftCount, selectedProposalCount, isCurrentCycleTerminal, rebalanceChecklistAllPassed, busy } = input;

  // 已完成/已取消
  if (currentCycle && isCurrentCycleTerminal) {
    const status = currentCycle.status === "completed" ? "已执行完成" : "周期已取消";
    return { step: "complete", index: 0, label: status, hint: "可生成新的调仓周期" };
  }

  // 执行中
  if (currentCycle?.status === "executing") {
    return { step: "execute", index: 5, label: "执行中", hint: "请等待执行结果" };
  }

  // 有周期且清单全通过 → 可执行
  if (currentCycle && rebalanceChecklistAllPassed && selectedProposalCount > 0) {
    return { step: "execute", index: 5, label: "可执行", hint: `已选 ${selectedProposalCount} 条建议，确认后执行` };
  }

  // 有周期且已勾选 → 风控门禁
  if (currentCycle && selectedProposalCount > 0 && currentRiskCheck) {
    const riskStatus = currentRiskCheck.overallStatus;
    if (riskStatus === "block") {
      return { step: "risk_gate", index: 4, label: "风控阻断", hint: "存在阻断级风控项，需处理后才能执行" };
    }
    if (riskStatus === "warn") {
      return { step: "risk_gate", index: 4, label: "风控警告", hint: "存在警告项，可继续执行但请注意风险" };
    }
    return { step: "risk_gate", index: 4, label: "风控通过", hint: "所有风控检查已通过" };
  }

  // 有周期但未勾选 → 审阅
  if (currentCycle && currentCycle.proposals.length > 0) {
    return { step: "review", index: 3, label: "待审阅", hint: `${currentCycle.proposals.length} 条建议待勾选` };
  }

  // 有周期但无建议 → 生成阶段（可能在生成中或结果为空）
  if (currentCycle) {
    return { step: "generate", index: 2, label: busy ? "生成中" : "建议为空", hint: busy ? "正在生成调仓建议" : "当前周期无可执行建议" };
  }

  // 无周期但有漂移 → 检测到偏离
  if (driftCount > 0) {
    return { step: "detect", index: 1, label: `${driftCount} 项偏移超阈值`, hint: "点击生成建议开始调仓" };
  }

  // 无周期无漂移 → 空闲
  return { step: "idle", index: 0, label: "配置均衡", hint: "所有持仓在目标权重阈值内，无需调仓" };
}

export const WORKFLOW_STEPS: Array<{ step: WorkflowStep; label: string }> = [
  { step: "detect", label: "检测" },
  { step: "generate", label: "生成" },
  { step: "review", label: "审阅" },
  { step: "risk_gate", label: "风控" },
  { step: "execute", label: "执行" },
];
