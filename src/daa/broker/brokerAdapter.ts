import { replaceDaaAccountState, replaceDaaPositions } from "@/src/daa/store/daaStorePg";

import { resolveBrokerRuntimeConfig } from "./brokerConfig";
import { IbkrPaperBroker } from "./ibkrPaperBroker";
import { SimBroker } from "./simBroker";
import type { BrokerAdapter } from "./brokerTypes";

export async function resolveActiveBrokerAdapter(): Promise<BrokerAdapter> {
  const config = await resolveBrokerRuntimeConfig();
  if (config.kind === "ibkr_paper") {
    return new IbkrPaperBroker(config.ibkr);
  }
  return new SimBroker();
}

export async function syncActiveBrokerSnapshotToStore(): Promise<{
  kind: "sim" | "ibkr_paper";
  synced: boolean;
  positionCount: number;
}> {
  const broker = await resolveActiveBrokerAdapter();
  if (broker.kind === "sim") {
    return { kind: "sim", synced: false, positionCount: 0 };
  }

  const [account, positions] = await Promise.all([
    broker.getAccountSummary(),
    broker.getPositions(),
  ]);

  await Promise.all([
    replaceDaaAccountState({
      baseCurrency: account.baseCurrency,
      cash: account.cash,
      investableCash: account.investableCash,
      frozenCash: account.frozenCash,
      totalEquity: account.totalEquity,
    }),
    replaceDaaPositions(
      positions
        .filter((item) => item.qty > 0)
        .map((item) => ({
          assetKey: item.assetKey,
          symbol: item.symbol,
          market: item.market,
          currency: item.currency,
          qty: item.qty,
          price: item.lastPrice ?? item.price,
          costBasis: item.costBasis,
          tags: [],
        })),
    ),
  ]);

  return {
    kind: broker.kind,
    synced: true,
    positionCount: positions.length,
  };
}
