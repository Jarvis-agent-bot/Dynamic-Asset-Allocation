import { getDaaAccountScopeId } from "@/src/daa/account/accountScope";
import { getDaaLedgerStartTs, listDaaTradeTickets, listTargetWeightAudits, type DaaStoreTradeTicket } from "@/src/daa/store/daaStorePg";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";

import type { AssetDetailReadModel, AssetDetailTradeMarker } from "./readModels";
import { getOrSetReadModelMemoryCache } from "./readModelMemoryCache";

function normalizeKey(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function isWithinCurrentLedger(ts: string | null | undefined, ledgerStartTs: string | null): boolean {
  if (!ledgerStartTs) return true;
  if (!ts) return false;
  return Date.parse(ts) >= Date.parse(ledgerStartTs);
}

function mapTradeMarker(ticket: DaaStoreTradeTicket): AssetDetailTradeMarker | null {
  if (!ticket.executedAt) return null;
  const qty = Number(ticket.filledQty ?? ticket.qty);
  const price = Number(ticket.avgFillPrice ?? ticket.price);
  if (!(qty > 0) || !(price > 0)) return null;
  return {
    date: ticket.executedAt.slice(0, 10),
    side: ticket.side,
    qty,
    price,
  };
}

async function buildAssetDetailReadModelUncached(assetKeyRaw: string): Promise<AssetDetailReadModel> {
  const assetKey = normalizeKey(assetKeyRaw);
  const bootstrap = await buildWorkbenchBootstrap({
    syncPrices: false,
    autoRiskCycle: false,
  });
  const row = bootstrap.assetUniverse.find((item) => normalizeKey(item.assetKey) === assetKey) ?? null;
  const symbol = row?.symbol ? normalizeKey(row.symbol) : assetKey.split("::").pop() || "";

  const [tickets, ledgerStartTs, targetWeightAudits] = symbol
    ? await Promise.all([
      listDaaTradeTickets({ symbol, limit: 80 }),
      getDaaLedgerStartTs(),
      listTargetWeightAudits({ assetKey, limit: 12 }),
    ])
    : [[], await getDaaLedgerStartTs(), []];

  const tradeMarkers = tickets
    .filter((ticket) => isWithinCurrentLedger(ticket.createdAt, ledgerStartTs))
    .map(mapTradeMarker)
    .filter((item): item is AssetDetailTradeMarker => Boolean(item))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    assetKey,
    row,
    baseCurrency: bootstrap.baseCurrency,
    account: {
      cash: bootstrap.account.cash,
      investableCash: bootstrap.account.investableCash,
      frozenCash: bootstrap.account.frozenCash,
      totalEquity: bootstrap.account.totalEquity,
      valuation: bootstrap.account.valuation,
    },
    execution: {
      feeRateBps: bootstrap.execution.feeRateBps,
      slippageBps: bootstrap.execution.slippageBps,
      minNotional: bootstrap.execution.minNotional,
    },
    tradeMarkers,
    targetWeightAudits,
    loadedAt: new Date().toISOString(),
  };
}

export async function buildAssetDetailReadModel(input: {
  assetKey: string;
  fresh?: boolean;
}): Promise<AssetDetailReadModel> {
  const assetKey = normalizeKey(input.assetKey);
  const scopeId = getDaaAccountScopeId();
  if (input.fresh) {
    return buildAssetDetailReadModelUncached(assetKey);
  }
  return getOrSetReadModelMemoryCache(
    `asset-detail:${scopeId}:${assetKey}`,
    5000,
    () => buildAssetDetailReadModelUncached(assetKey),
  );
}
