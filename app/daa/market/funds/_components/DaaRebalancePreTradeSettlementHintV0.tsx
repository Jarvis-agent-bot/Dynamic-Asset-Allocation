type DaaRebalancePreTradeSettlementHintV0Props = {
  sellProceedsRoutingV0: 'TARGET_CASH_BUCKET' | 'CASH';
};

export default function DaaRebalancePreTradeSettlementHintV0({ sellProceedsRoutingV0 }: DaaRebalancePreTradeSettlementHintV0Props) {
  const isImmediate = sellProceedsRoutingV0 === 'CASH';

  return (
    <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
      Settlement mode: {isImmediate ? 'Immediate funding (T+0)' : 'Conservative funding (T+1/T+2)'}.
      {' '}
      {isImmediate
        ? 'Assumption: sell proceeds can fund BUY orders.'
        : 'Assumption: BUY notional must be covered by starting cash.'}
    </div>
  );
}
