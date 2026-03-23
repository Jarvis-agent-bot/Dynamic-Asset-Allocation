import type { TradeTicket } from "@/src/daa/modules/trade/tradeTypes";

function formatMoney(value: number, currency: string): string {
  const amount = Number.isFinite(value) ? value : 0;
  const code = String(currency || "USD").trim().toUpperCase() || "USD";
  return `${amount.toFixed(2)} ${code}`;
}

function tradeSideLabel(side: string): string {
  return String(side || "").trim().toUpperCase() === "SELL" ? "卖出" : "买入";
}

function tradeStatusLabel(status: string): string {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "executed") return "已执行";
  if (normalized === "submitted") return "已提交";
  if (normalized === "partially_filled") return "部分成交";
  if (normalized === "rejected") return "已拒绝";
  if (normalized === "canceled") return "已取消";
  if (normalized === "ready") return "待执行";
  return normalized || "未知";
}

function executionSourceLabel(source: string): string {
  const normalized = String(source || "").trim().toLowerCase();
  if (normalized === "manual_trade_execution") return "手动成交";
  if (normalized === "decision_trade_execution") return "手动执行建议";
  if (normalized === "rebalance_cycle_execution") return "再平衡执行";
  return normalized || "执行事件";
}

export function buildTradeExecutionNotifyText(input: {
  source: string;
  baseCurrency: string;
  executeMode?: "selected" | "all" | "single";
  cycleId?: string | null;
  ticketId?: string | null;
  venueKind?: string | null;
  venueAccountId?: string | null;
  executedCount: number;
  submittedCount?: number;
  failedCount: number;
  totalCount: number;
  totalNotional: number;
  logs: TradeTicket[];
}): string {
  const lines: string[] = [];
  lines.push("DAA 交易执行通知");
  lines.push(`来源：${executionSourceLabel(input.source)}`);
  if (input.executeMode) {
    lines.push(`执行模式：${input.executeMode === "selected" ? "仅已勾选" : input.executeMode === "all" ? "全部建议" : "单笔执行"}`);
  }
  if (input.venueKind) {
    lines.push(`执行通道：${input.venueKind}${input.venueAccountId ? ` · ${input.venueAccountId}` : ""}`);
  }
  if (input.cycleId) lines.push(`周期 ID：${input.cycleId}`);
  if (input.ticketId) lines.push(`订单 ID：${input.ticketId}`);
  lines.push(`结果：成交 ${input.executedCount} / 已提交 ${input.submittedCount ?? 0} / 失败 ${input.failedCount} / 总计 ${input.totalCount}`);
  lines.push(`名义金额：${formatMoney(input.totalNotional, input.baseCurrency)}`);

  lines.push("");
  lines.push("订单明细：");
  const rows = (input.logs || []).slice(0, 8);
  if (rows.length <= 0) {
    lines.push("- 本次没有形成可展示的成交记录。");
  } else {
    for (const row of rows) {
      lines.push(
        `- ${row.symbol} ${tradeSideLabel(row.side)} ${Number(row.qty || 0).toFixed(4)} @ ${Number(row.price || 0).toFixed(4)} ${row.instrumentCurrency || input.baseCurrency} · ${tradeStatusLabel(row.status)}${row.brokerKind ? ` · ${row.brokerKind}${row.brokerAccountId ? `/${row.brokerAccountId}` : ""}` : ""}`,
      );
    }
  }
  if (input.logs.length > rows.length) {
    lines.push(`- 其余 ${input.logs.length - rows.length} 笔已省略。`);
  }

  if (input.failedCount > 0) {
    lines.push("");
    lines.push("备注：本次执行存在失败订单，请回到交易记录页面查看拒单原因。");
  } else if ((input.submittedCount ?? 0) > 0) {
    lines.push("");
    lines.push("备注：存在已提交但未成交的订单，需等待后续状态同步。");
  }

  return lines.join("\n");
}
