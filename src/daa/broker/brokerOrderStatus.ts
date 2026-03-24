import type { TradeTicketStatus } from "@/src/daa/modules/trade/tradeTypes";

function normalizeStatus(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

export function mapBrokerOrderStatusToTradeTicketStatus(statusRaw: string | null | undefined): TradeTicketStatus {
  const status = normalizeStatus(statusRaw);
  if (!status) return "submitted";

  if (status === "pendingsubmit" || status === "presubmitted" || status === "submitted") return "submitted";
  if (status === "partiallyfilled") return "partially_filled";
  if (status === "filled" || status === "executed") return "executed";
  if (status === "cancelled" || status === "apicancelled") return "canceled";
  if (status === "inactive" || status === "rejected") return "rejected";
  return "submitted";
}

export function isBrokerOrderOpenStatus(statusRaw: string | null | undefined): boolean {
  const status = mapBrokerOrderStatusToTradeTicketStatus(statusRaw);
  return status === "submitted" || status === "partially_filled";
}
