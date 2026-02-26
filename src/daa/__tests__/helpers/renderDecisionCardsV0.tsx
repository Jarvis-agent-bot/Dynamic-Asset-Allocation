import React, { type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import DaaRebalancePanelDecisionCardsV0 from '../../../../app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0';

type DecisionCardsProps = ComponentProps<typeof DaaRebalancePanelDecisionCardsV0>;

type DecisionCardsOverrides = Partial<DecisionCardsProps> & {
  priceDataWarningsV0?: Partial<DecisionCardsProps['priceDataWarningsV0']>;
  liquiditySettlementGateV0?: Partial<DecisionCardsProps['liquiditySettlementGateV0']>;
  preTradeCashCheck?: Partial<DecisionCardsProps['preTradeCashCheck']>;
};

const baseProps: DecisionCardsProps = {
  rebalanceTableRows: [
    { id: 'BTC', deltaPct: 0.12, targetPct: 0.3 },
    { id: 'ETH', deltaPct: -0.08, targetPct: 0.25 },
    { id: 'SOL', deltaPct: 0.03, targetPct: 0.2 },
    { id: 'XRP', deltaPct: -0.01, targetPct: 0.15 },
  ],
  priceDataWarningsV0: {
    missing: [{ sym: 'BTC' }],
    lastClose: [{ sym: 'ETH' }],
  },
  driftThresholdPct: 0.04,
  liquiditySettlementGateV0: {
    blocked: true,
    settlementLagDays: 2,
    cashGap: 120,
    estimatedBuys: 400,
    estimatedSells: 280,
    availableCash: 160,
    settledLiquidityCoverage: 0.35,
  },
  preTradeCashCheck: { blocking: true },
  baseCcy: 'USDT',
  jumpTo: () => {},
  openPreflightForRun: () => {},
};

export function renderDecisionCardsV0(overrides: DecisionCardsOverrides = {}): string {
  const props: DecisionCardsProps = {
    ...baseProps,
    ...overrides,
    priceDataWarningsV0: {
      ...baseProps.priceDataWarningsV0,
      ...(overrides.priceDataWarningsV0 ?? {}),
    },
    liquiditySettlementGateV0: {
      ...baseProps.liquiditySettlementGateV0,
      ...(overrides.liquiditySettlementGateV0 ?? {}),
    },
    preTradeCashCheck: {
      ...baseProps.preTradeCashCheck,
      ...(overrides.preTradeCashCheck ?? {}),
    },
  };

  return renderToStaticMarkup(<DaaRebalancePanelDecisionCardsV0 {...props} />);
}
