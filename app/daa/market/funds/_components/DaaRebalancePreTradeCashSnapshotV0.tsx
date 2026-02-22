type DaaRebalancePreTradeCashSnapshotV0Props = {
  cashStart: number;
  buyNotional: number;
  sellNotional: number;
  cashAfter: number;
  baseCcy: string | null;
  blocking: boolean;
};

export default function DaaRebalancePreTradeCashSnapshotV0(props: DaaRebalancePreTradeCashSnapshotV0Props) {
  const { cashStart, buyNotional, sellNotional, cashAfter, baseCcy, blocking } = props;

  return (
    <>
      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
        cashStart=<b>{cashStart.toFixed(2)}</b>{baseCcy ? ` ${baseCcy}` : ''}
        {' '}· buy=<b>{buyNotional.toFixed(2)}</b>{baseCcy ? ` ${baseCcy}` : ''}
        {' '}· sell=<b>{sellNotional.toFixed(2)}</b>{baseCcy ? ` ${baseCcy}` : ''}
        {' '}· cashAfter≈<b>{cashAfter.toFixed(2)}</b>{baseCcy ? ` ${baseCcy}` : ''}
      </div>
      <div style={{ fontSize: 11, marginTop: 4, color: blocking ? 'var(--danger)' : '#16a34a' }}>
        {blocking ? 'Needs top-up before run' : 'Ready for run'}
      </div>
    </>
  );
}
