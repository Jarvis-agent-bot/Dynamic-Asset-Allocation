import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

import {
  FieldLabel,
  NumberInput,
  SectionCard,
  settingsGridCols3Style,
  type SettingsConfigSetter,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";

export function SettingsRiskSection(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  const { config, setConfig } = props;

  const fields: Array<{
    label: string;
    value: number;
    min?: number;
    max?: number;
    step?: number;
    onChange: (value: number) => void;
  }> = [
    {
      label: "单一持仓上限 (%)",
      value: config.strategy.constraints.maxPositionPct * 100,
      min: 1,
      max: 100,
      step: 0.5,
      onChange: (value: number) =>
        setConfig((prev) =>
          prev
            ? {
                ...prev,
                strategy: {
                  ...prev.strategy,
                  constraints: {
                    ...prev.strategy.constraints,
                    maxPositionPct: Math.max(0.01, Math.min(1, value / 100)),
                  },
                },
              }
            : prev,
        ),
    },
    {
      label: "单日调仓上限（%）",
      value: config.strategy.constraints.maxOrderPctOfNav * 100,
      min: 1,
      max: 100,
      step: 0.5,
      onChange: (value: number) =>
        setConfig((prev) =>
          prev
            ? {
                ...prev,
                strategy: {
                  ...prev.strategy,
                  constraints: {
                    ...prev.strategy.constraints,
                    maxOrderPctOfNav: Math.max(0.01, Math.min(1, value / 100)),
                  },
                },
              }
            : prev,
        ),
    },
    {
      label: "最小交易金额",
      value: config.strategy.constraints.minNotional,
      min: 1,
      max: 100000,
      step: 1,
      onChange: (value: number) =>
        setConfig((prev) =>
          prev
            ? {
                ...prev,
                strategy: {
                  ...prev.strategy,
                  constraints: {
                    ...prev.strategy.constraints,
                    minNotional: Math.max(1, value),
                  },
                },
              }
            : prev,
        ),
    },
    {
      label: "默认手续费（基点）",
      value: config.strategy.execution.feeRateBps,
      min: 0,
      max: 500,
      step: 0.1,
      onChange: (value: number) =>
        setConfig((prev) =>
          prev
            ? {
                ...prev,
                strategy: {
                  ...prev.strategy,
                  execution: {
                    ...prev.strategy.execution,
                    feeRateBps: Math.max(0, Math.min(500, value)),
                  },
                },
              }
            : prev,
        ),
    },
    {
      label: "默认滑点（基点）",
      value: config.strategy.execution.slippageBps,
      min: 0,
      max: 500,
      step: 0.1,
      onChange: (value: number) =>
        setConfig((prev) =>
          prev
            ? {
                ...prev,
                strategy: {
                  ...prev.strategy,
                  execution: {
                    ...prev.strategy.execution,
                    slippageBps: Math.max(0, Math.min(500, value)),
                  },
                },
              }
            : prev,
        ),
    },
    {
      label: "单资产止损阈值 (%)",
      value: config.strategy.risk.perAssetStopLossPct * 100,
      min: 5,
      max: 80,
      step: 0.5,
      onChange: (value: number) =>
        setConfig((prev) =>
          prev
            ? {
                ...prev,
                strategy: {
                  ...prev.strategy,
                  risk: {
                    ...prev.strategy.risk,
                    perAssetStopLossPct: Math.max(0.05, Math.min(0.8, value / 100)),
                  },
                },
              }
            : prev,
        ),
    },
    {
      label: "单资产止盈阈值 (%)",
      value: (config.strategy.risk.perAssetTakeProfitPct ?? 0.25) * 100,
      min: 5,
      max: 150,
      step: 0.5,
      onChange: (value: number) =>
        setConfig((prev) =>
          prev
            ? {
                ...prev,
                strategy: {
                  ...prev.strategy,
                  risk: {
                    ...prev.strategy.risk,
                    perAssetTakeProfitPct: Math.max(0.05, Math.min(1.5, value / 100)),
                  },
                },
              }
            : prev,
        ),
    },
    {
      label: "组合集中度上限（HHI）",
      value: config.strategy.risk.maxConcentrationPct * 100,
      min: 10,
      max: 100,
      step: 1,
      onChange: (value: number) =>
        setConfig((prev) =>
          prev
            ? {
                ...prev,
                strategy: {
                  ...prev.strategy,
                  risk: {
                    ...prev.strategy.risk,
                    maxConcentrationPct: Math.max(0.1, Math.min(1, value / 100)),
                  },
                },
              }
            : prev,
        ),
    },
  ] as const;

  return (
    <section id="settings-risk" className="scroll-mt-28">
      <SectionCard title="风控参数">
        <div style={settingsGridCols3Style}>
          {fields.map((field) => (
            <div key={field.label}>
              <FieldLabel>{field.label}</FieldLabel>
              <NumberInput value={field.value} min={field.min} max={field.max} step={field.step} onChange={field.onChange} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, color: "var(--muted)", fontSize: 12 }}>
          历史研究与执行摘要共享同一套执行口径：单笔 NAV 上限、手续费、滑点与成交时点。当前成交时点固定为 T+1 close。
        </div>
      </SectionCard>
    </section>
  );
}
