type PriceWarningRowV0 = { sym: string; label: string; price?: number };

type Props = {
  targetWeightsSource: string;
  priceDataWarningsV0: { missing: PriceWarningRowV0[]; lastClose: PriceWarningRowV0[] };
  assetBlacklistTextV0: string;
  setAssetBlacklistTextV0: (value: string) => void;
  cashBucketTargetPct01: number;
  persistCashBucketTargetPct01V0: (value: number) => void;
  maxTurnoverPct01V0: number;
  persistMaxTurnoverPct01V0: (value: number) => void;
  baseCcy: string | null;
  rebalancePolicyMinTradeNotional: number;
  whatIfTurnoverPctOfTotalBefore: number | null;
  investablePct01: number;
  moneyPlanInvestablePct01: number | null;
  assetBlacklistV0: string[];
  portfolioLastRebalanceAt: string | null;
};

export default function DaaRebalanceRiskControlsSectionV0({
  targetWeightsSource,
  priceDataWarningsV0,
  assetBlacklistTextV0,
  setAssetBlacklistTextV0,
  cashBucketTargetPct01,
  persistCashBucketTargetPct01V0,
  maxTurnoverPct01V0,
  persistMaxTurnoverPct01V0,
  baseCcy,
  rebalancePolicyMinTradeNotional,
  whatIfTurnoverPctOfTotalBefore,
  investablePct01,
  moneyPlanInvestablePct01,
  assetBlacklistV0,
  portfolioLastRebalanceAt,
}: Props) {
  const ccy = baseCcy ? ` ${baseCcy}` : '';
  const minOrder = rebalancePolicyMinTradeNotional;
  const effectiveTurnoverPct = whatIfTurnoverPctOfTotalBefore;
  const turnoverBlocked = effectiveTurnoverPct !== null && maxTurnoverPct01V0 > 0 && effectiveTurnoverPct > maxTurnoverPct01V0 + 1e-12;
  const turnoverText =
    effectiveTurnoverPct !== null
      ? `turnover≈${(effectiveTurnoverPct * 100).toFixed(1)}%${turnoverBlocked ? ' (exceeds)' : ''}`
      : 'turnover≈n/a';

  return (
    <>
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        Current = holdings × (manual price or estGsz/gsz/dwjz) + cash; Target = manual targetWeights (if configured) else engine targetWeights/money_plan.allocations; Orders = engine orders or naive diff.
        <span style={{ marginLeft: 6 }}>
          targetWeights source: <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{targetWeightsSource}</span>
        </span>
      </div>
      <div
        style={{
          marginTop: 8,
          padding: '10px 12px',
          border: '1px solid rgba(59, 130, 246, 0.45)',
          borderRadius: 12,
          background: 'rgba(59, 130, 246, 0.08)',
        }}
        role="note"
        aria-label="Risk disclosure"
      >
        <div style={{ fontSize: 12, fontWeight: 800 }}>Risk disclosure</div>
        <div className="muted" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.6 }}>
          Dynamic rebalancing suggestions are generated from local inputs (holdings, prices, target weights, policy). They can be wrong and may increase turnover/costs.
        </div>
        <details style={{ marginTop: 6 }}>
          <summary className="muted" style={{ cursor: 'pointer', fontSize: 11 }}>
            Learn more
          </summary>
          <div className="muted" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.6, display: 'grid', gap: 4 }}>
            <div>- Not financial advice. Review inputs and constraints before executing.</div>
            <div>- Data risk: stale/missing quotes, wrong symbols, rounding/lot sizes.</div>
            <div>- Cost risk: fees, slippage/spread, taxes, min-trade constraints.</div>
            <div>- Safety: start with dry runs; keep a cash buffer; consider cooldown.</div>
          </div>
        </details>
      </div>
      {priceDataWarningsV0.missing.length || priceDataWarningsV0.lastClose.length ? (
        <div
          style={{
            marginTop: 8,
            padding: '10px 12px',
            border: '1px solid rgba(245, 158, 11, 0.55)',
            borderRadius: 12,
            background: 'rgba(245, 158, 11, 0.08)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800 }}>Price data warnings</div>
          {priceDataWarningsV0.missing.length ? (
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
              Missing price (excluded from current weights / core request):{' '}
              <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>
                {priceDataWarningsV0.missing
                  .slice(0, 10)
                  .map((x) => x.sym)
                  .join(', ')}
                {priceDataWarningsV0.missing.length > 10 ? ` (+${priceDataWarningsV0.missing.length - 10} more)` : ''}
              </span>
              . Fix: fill Price snapshot v0, or ensure Market/Funds quote has gsz/dwjz.
            </div>
          ) : null}
          {priceDataWarningsV0.lastClose.length ? (
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
              Using last close (dwjz) fallback (real-time quote missing):{' '}
              <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>
                {priceDataWarningsV0.lastClose
                  .slice(0, 10)
                  .map((x) => `${x.sym}=${x.price}`)
                  .join(', ')}
                {priceDataWarningsV0.lastClose.length > 10 ? ` (+${priceDataWarningsV0.lastClose.length - 10} more)` : ''}
              </span>
              .
            </div>
          ) : null}
        </div>
      ) : null}
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: 8 }}>
        <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
          Asset blacklist
        </div>
        <input
          value={assetBlacklistTextV0}
          onChange={(e) => setAssetBlacklistTextV0(e.target.value)}
          placeholder="Comma/space separated symbols to exclude (e.g. USDT BTC 005963)"
          style={{
            flex: '1 1 360px',
            minWidth: 260,
            padding: '6px 10px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.10)',
            background: 'rgba(0,0,0,0.14)',
          }}
          aria-label="Rebalance asset blacklist"
        />
        <div className="muted" style={{ fontSize: 11 }}>
          Excluded from holdings + targetWeights (and their prices) when generating plans.
        </div>
      </div>
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: 10 }}>
        <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
          Guardrails
        </div>
        <label className="muted" style={{ fontSize: 11, display: 'flex', gap: 6, alignItems: 'center' }}>
          cash buffer (%)
          <input
            type="number"
            min={0}
            max={95}
            step={1}
            value={Math.round(cashBucketTargetPct01 * 100)}
            onChange={(e) => persistCashBucketTargetPct01V0(Number(e.target.value) / 100)}
            style={{
              width: 92,
              padding: '6px 10px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(0,0,0,0.14)',
            }}
            aria-label="Rebalance cash buffer target percent"
          />
        </label>
        <label className="muted" style={{ fontSize: 11, display: 'flex', gap: 6, alignItems: 'center' }}>
          max turnover (%)
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={Math.round(maxTurnoverPct01V0 * 100)}
            onChange={(e) => persistMaxTurnoverPct01V0(Number(e.target.value) / 100)}
            style={{
              width: 92,
              padding: '6px 10px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(0,0,0,0.14)',
            }}
            aria-label="Rebalance max turnover percent"
          />
        </label>
        <div className="muted" style={{ fontSize: 11 }}>
          min order≈<b>{minOrder.toFixed(2)}</b>
          {ccy} · investable≈<b>{(investablePct01 * 100).toFixed(0)}%</b> · {turnoverText}
          {moneyPlanInvestablePct01 !== null ? (
            <> · money_plan investable≈{(moneyPlanInvestablePct01 * 100).toFixed(0)}%</>
          ) : (
            <>
              {' '}
              · money_plan investable: <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>n/a</span>
            </>
          )}
          <span className="muted"> · set max turnover=0 to disable</span>
        </div>
      </div>
      {assetBlacklistV0.length ? (
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Active blacklist: <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{assetBlacklistV0.join(', ')}</span>
        </div>
      ) : null}
      {portfolioLastRebalanceAt ? (
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          portfolioState.lastRebalance.at:{' '}
          <span style={{ fontFamily: 'ui-monospace, SFMono-Regular' }}>{portfolioLastRebalanceAt}</span>
        </div>
      ) : null}
    </>
  );
}
