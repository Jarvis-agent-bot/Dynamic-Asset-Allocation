import {
  LS_AUTO_PLAN_INPUT,
  LS_AUTO_PLAN_SCENARIO_PRESETS_V0,
  type AutoPlanScenarioPresetV0,
} from './DaaRebalancePanel.storageV0';
import { readJsonFromLs } from '../../../wizardStorage';

export function getDriftBadgeV0(deltaPct: number, driftThresholdPct: number) {
  const kind = deltaPct >= driftThresholdPct ? 'over' : deltaPct <= -driftThresholdPct ? 'under' : 'ok';
  const driftAbsPct = (Math.abs(deltaPct) * 100).toFixed(1);
  return {
    kind,
    driftAbsPct,
    text: kind === 'over' ? `OVER +${driftAbsPct}%` : kind === 'under' ? `UNDER -${driftAbsPct}%` : `OK ${driftAbsPct}%`,
    color: kind === 'over' ? 'var(--danger)' : kind === 'under' ? 'var(--primary)' : 'var(--muted)',
    valueColor: kind === 'ok' ? 'var(--text)' : kind === 'over' ? 'var(--danger)' : 'var(--primary)',
  } as const;
}

function readAutoPlanInputV0() {
  const saved = readJsonFromLs<any>(LS_AUTO_PLAN_INPUT);
  return saved && typeof saved === 'object' ? saved : null;
}

function readAutoPlanThresholdOverrideV0(v: unknown): number | null {
  const n = v === null || v === undefined ? Number.NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function readAutoPlanPresetsV0(): AutoPlanScenarioPresetV0[] {
  const saved = readJsonFromLs<any>(LS_AUTO_PLAN_SCENARIO_PRESETS_V0);
  if (!Array.isArray(saved)) return [];
  return saved
    .filter((x) => x && typeof x === 'object')
    .map((x: any) => ({
      id: String(x.id ?? ''),
      name: String(x.name ?? ''),
      updatedAt: String(x.updatedAt ?? ''),
      inputA: String(x.inputA ?? ''),
      inputB: String(x.inputB ?? ''),
      thresholdPctOverrideA: readAutoPlanThresholdOverrideV0(x.thresholdPctOverrideA),
      thresholdPctOverrideB: readAutoPlanThresholdOverrideV0(x.thresholdPctOverrideB),
    }))
    .filter((x) => x.id && x.name);
}

export function readAutoPlanBootstrapV0() {
  const saved = readAutoPlanInputV0();
  const scenarioA = saved?.a;
  const scenarioB = saved?.b;
  const textA =
    scenarioA && typeof scenarioA === 'object' && typeof (scenarioA as any).text === 'string'
      ? String((scenarioA as any).text)
      : typeof (saved as any)?.text === 'string'
        ? String((saved as any).text)
        : '';
  const textB = scenarioB && typeof scenarioB === 'object' && typeof (scenarioB as any).text === 'string' ? String((scenarioB as any).text) : '';
  return {
    scenario: String(saved?.active ?? '') === 'B' ? ('B' as const) : ('A' as const),
    textA,
    textB,
    thresholdA: readAutoPlanThresholdOverrideV0(saved?.a?.thresholdPctOverride),
    thresholdB: readAutoPlanThresholdOverrideV0(saved?.b?.thresholdPctOverride),
  };
}
