import type { PolicyDecision } from "@/src/daa/modules/policy-engine/policyTypes";
import type { PreTradeRiskCheck, PreTradeRiskCheckItem } from "@/src/daa/modules/rebalance/rebalanceTypes";
import type { RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";
import type { DaaSurfaceTone } from "@/app/daa/dashboard/_components/DaaSurfaceUI";

export interface RebalanceDecisionInput {
  cycle: RebalanceCycle | null;
  riskCheck: PreTradeRiskCheck | null;
  policyDecision: PolicyDecision | null;
  selectedProposalCount: number;
  canExecuteSelected: boolean;
  isCurrentCycleTerminal: boolean;
}

export interface RebalanceDecisionState {
  tone: DaaSurfaceTone;
  title: string;
  description: string;
  nextStep: string;
}

interface DecisionRule {
  match: (input: RebalanceDecisionInput) => boolean;
  resolve: (input: RebalanceDecisionInput) => RebalanceDecisionState;
}

const DECISION_RULES: DecisionRule[] = [
  {
    match: ({ cycle }) => !cycle,
    resolve: () => ({
      tone: "primary",
      title: "等待生成本轮调仓建议",
      description: "先生成本轮建议，再审阅买卖清单、风控结果和执行影响。",
      nextStep: "下一步：在下方执行面板生成本轮建议。",
    }),
  },
  {
    match: ({ riskCheck }) => riskCheck?.overallStatus === "block",
    resolve: ({ riskCheck }) => ({
      tone: "danger",
      title: "风控阻断，暂不应执行",
      description: riskCheck?.items.find((item) => item.status === "block")?.message ?? "存在阻断项，需要先降低仓位或调整建议。",
      nextStep: "下一步：展开建议详情，处理阻断项后重新复核。",
    }),
  },
  {
    match: ({ isCurrentCycleTerminal }) => isCurrentCycleTerminal,
    resolve: ({ cycle }) => ({
      tone: cycle?.status === "completed" ? "success" : "neutral",
      title: cycle?.status === "completed" ? "本轮调仓已完成" : "本轮调仓已终止",
      description: cycle?.status === "completed"
        ? "该周期已进入只读状态，可生成新一轮建议继续审阅。"
        : "该周期已取消或结束，建议生成新周期重新评估。",
      nextStep: "下一步：如需继续调仓，生成新一轮建议。",
    }),
  },
  {
    match: ({ cycle }) => (cycle?.proposals?.length ?? 0) === 0,
    resolve: ({ cycle }) => ({
      tone: "neutral",
      title: "本轮没有可执行建议",
      description: cycle?.triggerReason || "组合仍在目标范围内，或候选资产暂未满足金额、信念与风控条件。",
      nextStep: "下一步：查看下方依据，确认是否需要调整策略阈值。",
    }),
  },
  {
    match: ({ policyDecision, riskCheck }) =>
      policyDecision?.action === "authorize_auto_execute" && (riskCheck?.overallStatus ?? "pass") !== "block",
    resolve: ({ policyDecision, riskCheck }) => ({
      tone: "success",
      title: "系统建议自动执行",
      description: riskCheck?.overallStatus === "warn"
        ? "策略评分已过阈值，但仍有风控提示，建议先复核再执行。"
        : "策略评分已过阈值，可一键执行全部建议；如有疑虑，可先勾选部分建议。",
      nextStep: policyDecision?.score != null && policyDecision?.threshold != null
        ? `下一步：执行全部，或勾选要执行的建议（行动分 ${policyDecision.score.toFixed(1)} / ${policyDecision.threshold.toFixed(1)}）。`
        : "下一步：执行全部，或勾选要执行的建议。",
    }),
  },
  {
    match: ({ selectedProposalCount, canExecuteSelected }) => selectedProposalCount > 0 && canExecuteSelected,
    resolve: () => ({
      tone: "success",
      title: "已选建议可执行",
      description: "当前选中项已通过执行前检查，可以先执行选中项，保留其余建议继续观察。",
      nextStep: "下一步：在下方执行面板执行选中建议。",
    }),
  },
];

const FALLBACK: DecisionRule = {
  match: () => true,
  resolve: ({ cycle }) => ({
    tone: "warning",
    title: "建议待审阅",
    description: cycle?.triggerReason || "本轮已生成买卖建议，请先确认理由、金额和判断不一致标记。",
    nextStep: "下一步：勾选要执行的建议，或按买入/卖出快速筛选。",
  }),
};

export function buildDecisionState(input: RebalanceDecisionInput): RebalanceDecisionState {
  for (const rule of DECISION_RULES) {
    if (rule.match(input)) return rule.resolve(input);
  }
  return FALLBACK.resolve(input);
}

export function policyActionLabel(action: string | null | undefined): string {
  if (action === "authorize_auto_execute") return "可自动执行";
  if (action === "require_review") return "需要人工复核";
  if (action === "propose") return "生成建议";
  if (action === "observe") return "保持观察";
  if (action === "ignore") return "忽略噪声";
  return "等待决策";
}

export function formatSnapshotTime(value: string | null | undefined): string {
  if (!value) return "等待生成";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function totalProposalNotional(cycle: RebalanceCycle | null): number {
  return (cycle?.proposals ?? []).reduce((sum, item) => sum + Math.max(0, item.suggestedNotional || 0), 0);
}

/** 按 block > warn 优先级排序，取前 N 条非 pass 风控项。 */
export function topRiskItems(
  riskCheck: PreTradeRiskCheck | null,
  limit = 3,
): PreTradeRiskCheckItem[] {
  if (!riskCheck?.items?.length) return [];
  const severity: Record<PreTradeRiskCheckItem["status"], number> = { block: 0, warn: 1, pass: 2 };
  return riskCheck.items
    .filter((item) => item.status !== "pass")
    .slice()
    .sort((leftRiskItem, rightRiskItem) => severity[leftRiskItem.status] - severity[rightRiskItem.status])
    .slice(0, limit);
}
