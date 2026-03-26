import type { DaaSurfaceTone } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import type { PreTradeRiskCheck, RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";

export function cycleStatusLabel(status: RebalanceCycle["status"]): string {
  if (status === "generated") return "已生成";
  if (status === "reviewing") return "审阅中";
  if (status === "executing") return "执行中";
  if (status === "completed") return "已完成";
  if (status === "cancelled") return "已取消";
  return status;
}

export function triggerSourceLabel(source: RebalanceCycle["triggerSource"]): string {
  if (source === "calendar") return "定期触发";
  if (source === "drift") return "偏移触发";
  if (source === "risk") return "止盈止损触发";
  if (source === "cash_idle") return "现金闲置触发";
  return "手动触发";
}

export function marketRegimeLabel(regime: string | null | undefined): string {
  if (regime === "risk_off") return "偏防守";
  if (regime === "risk_on") return "偏进攻";
  if (regime === "transitional") return "过渡";
  return "待计算";
}

export function marketRegimeTone(regime: string | null | undefined): DaaSurfaceTone {
  if (regime === "risk_off") return "amber";
  if (regime === "risk_on") return "green";
  if (regime === "transitional") return "indigo";
  return "slate";
}

export function riskStatusLabel(status: PreTradeRiskCheck["overallStatus"]) {
  if (status === "block") return "阻断";
  if (status === "warn") return "警告";
  return "通过";
}

export function riskOverallTone(status: PreTradeRiskCheck["overallStatus"]): DaaSurfaceTone {
  if (status === "block") return "red";
  if (status === "warn") return "amber";
  return "green";
}

export function cycleStatusTone(status: RebalanceCycle["status"]): DaaSurfaceTone {
  if (status === "completed") return "green";
  if (status === "executing") return "indigo";
  if (status === "cancelled") return "slate";
  if (status === "reviewing") return "amber";
  return "cyan";
}

export function riskRuleLabel(rule: string): string {
  if (rule === "max_position") return "单一持仓上限";
  if (rule === "max_order_pct") return "单日交易上限";
  if (rule === "concentration") return "组合集中度";
  if (rule === "stop_loss_breach") return "止损阈值";
  if (rule === "total_weight") return "目标权重合计";
  return rule;
}

export function riskItemStatusLabel(status: "pass" | "warn" | "block"): string {
  if (status === "block") return "阻断";
  if (status === "warn") return "警告";
  return "通过";
}

export function riskItemTone(status: "pass" | "warn" | "block"): DaaSurfaceTone {
  if (status === "block") return "red";
  if (status === "warn") return "amber";
  return "green";
}

export function macroCyclePhaseLabel(phase: string | null | undefined): string {
  if (phase === "recovery") return "复苏";
  if (phase === "overheating") return "过热";
  if (phase === "stagflation") return "滞胀";
  if (phase === "deflation") return "衰退";
  return "待定";
}
