'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { useDaaRuntime } from '../../../useDaaRuntime';

import DaaDashboardAiExplain from '../../../dashboard/_components/DaaDashboardAiExplain';
import DaaDashboardExport from '../../../dashboard/_components/DaaDashboardExport';
import DaaDashboardImport from '../../../dashboard/_components/DaaDashboardImport';
import DaaDashboardRunChecklist from '../../../dashboard/_components/DaaDashboardRunChecklist';

import Step2MarketEventsPage from '../../../step/_pages/Step2MarketEventsPage';
import Step4BaselineRecommendationPage from '../../../step/_pages/Step4BaselineRecommendationPage';
import Step6HumanFactorPage from '../../../step/_pages/Step6HumanFactorPage';
import Step7TagsPage from '../../../step/_pages/Step7TagsPage';

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function DaaRebalancePanel() {
  const rt = useDaaRuntime();
  const [open, setOpen] = useState(false);

  const headline = useMemo(() => {
    const readyBits = [rt.marketEventCount ? 'events' : null, rt.hasRecommendation ? 'recommendation' : null, rt.hasHumanProfile ? 'human' : null].filter(Boolean);
    const readyText = readyBits.length ? readyBits.join(' + ') : 'empty';
    return `Next: ${rt.nextActionText} (data: ${readyText})`;
  }, [rt.hasHumanProfile, rt.hasRecommendation, rt.marketEventCount, rt.nextActionText]);

  return (
    <div id="daa-panel" className="col-12 glass card" role="region" aria-label="DAA Rebalance 面板">
      <div className="title" style={{ marginBottom: 12, justifyContent: 'space-between' as const }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const }}>
          <span style={{ fontWeight: 800 }}>DAA Rebalance</span>
          <span className="muted" style={{ fontSize: 12 }}>
            Hub on Market/Funds: checklist + import/export + explain
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <Link href="/daa/dashboard" className="muted" style={{ fontSize: 12 }}>
            Dashboard
          </Link>
          <Link href="/daa?step=1" className="muted" style={{ fontSize: 12 }}>
            Wizard
          </Link>
          <button
            type="button"
            className="button secondary"
            onClick={() => setOpen((v) => !v)}
            style={{ padding: '6px 10px' }}
            aria-expanded={open}
          >
            {open ? '收起' : '展开'}
          </button>
        </div>
      </div>

      <div className="muted" style={{ fontSize: 12, marginBottom: open ? 12 : 0 }}>
        {headline}
      </div>

      {open ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
          <DaaDashboardRunChecklist
            onJump={(id) => {
              scrollToId(id);
            }}
          />

          <div id="import" style={{ scrollMarginTop: 12 }}>
            <DaaDashboardImport />
          </div>

          <div id="export" style={{ scrollMarginTop: 12 }}>
            <DaaDashboardExport />
          </div>

          <div id="step2" style={{ scrollMarginTop: 12 }}>
            <Step2MarketEventsPage />
          </div>

          <div id="step4" style={{ scrollMarginTop: 12 }}>
            <Step4BaselineRecommendationPage />
          </div>

          {rt.hasRecommendation ? (
            <div id="step5" style={{ scrollMarginTop: 12 }}>
              <DaaDashboardAiExplain />
            </div>
          ) : (
            <div id="step5" style={{ scrollMarginTop: 12, fontSize: 12 }} className="muted">
              Step5 Explain: waiting for recommendation (run Step4 once).
            </div>
          )}

          <div id="step6" style={{ scrollMarginTop: 12 }}>
            <Step6HumanFactorPage />
          </div>

          <div id="step7" style={{ scrollMarginTop: 12 }}>
            <Step7TagsPage />
          </div>
        </div>
      ) : null}
    </div>
  );
}
