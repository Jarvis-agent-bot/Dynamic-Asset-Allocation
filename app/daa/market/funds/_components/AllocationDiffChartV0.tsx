import { useMemo, useState } from 'react';

import type { AllocationDiffRowV0 } from '@/src/daa/rebalancePostRunSummary';

function fmtPct01(x: number) {
  if (!Number.isFinite(x)) return 'n/a';
  return `${(x * 100).toFixed(1)}%`;
}

export default function AllocationDiffChartV0(props: { rows: AllocationDiffRowV0[] }) {
  const [expanded, setExpanded] = useState(false);

  const rowsSorted = useMemo(() => {
    const rows = Array.isArray(props.rows) ? props.rows : [];
    return rows
      .filter((r) => r && typeof r.id === 'string' && typeof r.label === 'string')
      .slice()
      .sort((a, b) => Math.abs(b.afterPct01 - b.beforePct01) - Math.abs(a.afterPct01 - a.beforePct01));
  }, [props.rows]);

  const maxRows = expanded ? rowsSorted.length : Math.min(12, rowsSorted.length);
  const visible = rowsSorted.slice(0, maxRows);

  if (!rowsSorted.length) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' as const, alignItems: 'baseline' }}>
        <div style={{ fontWeight: 700, fontSize: 12 }}>Allocation diff (pre vs post)</div>
        {rowsSorted.length > 12 ? (
          <button
            type="button"
            className={expanded ? 'button secondary' : 'button'}
            onClick={() => setExpanded((v) => !v)}
            style={{ padding: '4px 8px' }}
          >
            {expanded ? 'Collapse' : `Expand (${rowsSorted.length})`}
          </button>
        ) : null}
      </div>

      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
        Before/After bars are weights vs total portfolio (including cash). Dashed marker = target.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {visible.map((r) => {
          const before = Number.isFinite(r.beforePct01) ? r.beforePct01 : 0;
          const after = Number.isFinite(r.afterPct01) ? r.afterPct01 : 0;
          const target = Number.isFinite(r.targetPct01) ? r.targetPct01 : 0;
          const delta = after - before;

          return (
            <div
              key={r.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(120px, 180px) 1fr minmax(90px, 120px)',
                gap: 10,
                alignItems: 'center',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>

              <div
                style={{
                  position: 'relative',
                  height: 20,
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.10)',
                  background: 'rgba(0,0,0,0.10)',
                  overflow: 'hidden',
                }}
                aria-label={`${r.label}: before ${fmtPct01(before)}, after ${fmtPct01(after)}, target ${fmtPct01(target)}`}
              >
                {/* before */}
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    height: '50%',
                    width: `${Math.max(0, Math.min(1, before)) * 100}%`,
                    background: 'rgba(255,255,255,0.25)',
                  }}
                />
                {/* after */}
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    bottom: 0,
                    height: '50%',
                    width: `${Math.max(0, Math.min(1, after)) * 100}%`,
                    background: 'rgba(0, 170, 119, 0.55)',
                  }}
                />
                {/* target marker */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${Math.max(0, Math.min(1, target)) * 100}%`,
                    top: 0,
                    bottom: 0,
                    width: 0,
                    borderLeft: '1px dashed rgba(255,255,255,0.55)',
                  }}
                />
              </div>

              <div className="muted" style={{ fontSize: 11, textAlign: 'right' as const, fontFamily: 'ui-monospace, SFMono-Regular' }}>
                {fmtPct01(before)} to {fmtPct01(after)}
                <span style={{ marginLeft: 6, color: delta >= 0 ? 'var(--primary)' : 'var(--danger)' }}>
                  {delta >= 0 ? '+' : ''}
                  {(delta * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
