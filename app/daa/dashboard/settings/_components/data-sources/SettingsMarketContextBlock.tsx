import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

import {
  CheckboxRow,
  FieldLabel,
  MARKET_INDICATOR_ITEMS,
  NumberInput,
  SubsectionCard,
  type SettingsConfigSetter,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";

export function SettingsMarketContextBlock(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  const { config, setConfig } = props;

  return (
    <SubsectionCard title="市场状态层">
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex flex-col gap-3 border-b border-[var(--elevated)] px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-[var(--text)]">市场状态层</div>
            <div className="mt-1 max-w-3xl text-xs leading-6 text-[var(--muted)]">
              按美股、港股 / 中概、加密、宏观防御与政策环境拆分，用于调仓复核、风险提示和模型解读语境。
            </div>
          </div>
          <CheckboxRow
            checked={config.dataSources.marketIndicators.enabled}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      dataSources: {
                        ...prev.dataSources,
                        marketIndicators: { ...prev.dataSources.marketIndicators, enabled: value },
                      },
                    }
                  : prev,
              )
            }
          >
            启用市场状态层
          </CheckboxRow>
        </div>

        <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(220px,0.45fr)_1fr]">
          <div>
            <FieldLabel>缓存有效期（分钟）</FieldLabel>
            <NumberInput
              value={config.dataSources.marketIndicators.refreshIntervalMinutes}
              min={5}
              max={240}
              onChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        dataSources: {
                          ...prev.dataSources,
                          marketIndicators: {
                            ...prev.dataSources.marketIndicators,
                            refreshIntervalMinutes: Math.max(5, Math.min(240, Math.trunc(value || 5))),
                          },
                        },
                      }
                    : prev,
                )
              }
            />
            <div className="mt-1.5 text-[11px] leading-5 text-[var(--faint)]">
              控制市场状态快照多久算新鲜；实际刷新频率由部署调度控制。
            </div>
          </div>

          <div className="rounded-[var(--radius-sm)] border border-[var(--elevated)] bg-[var(--elevated)]/40 px-3 py-2.5">
            <div className="text-xs font-semibold text-[var(--text)]">市场划分说明</div>
            <div className="mt-1.5 text-xs leading-6 text-[var(--muted)]">
              美股看波动、成长风格和广度；港股 / 中概看波动和中概互联相对强弱；加密看 BTC/ETH 风格和 BTC 波动；宏观层看金银比、收益率曲线、美元、信用、通胀代理、PPI、政策利率与美联储资产负债表。
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--elevated)] px-4 py-3 text-xs leading-6 text-[var(--muted)]">
          数据源对照：VIX → ^VIX；QQQ/SPY → QQQ / SPY；FXI 波动率 → FXI；KWEB/FXI → KWEB / FXI；BTC/ETH → BTC-USD / ETH-USD；BTC 波动率 → BTC-USD；金银比 → GC=F / SI=F；收益率曲线 → IEF / SHY；美元 → UUP；信用利差 → HYG / LQD；通胀预期 → TIP / IEF；市场广度 → RSP / SPY；PPI / 政策利率 / 缩表 → FRED。
        </div>

        <div className="border-t border-[var(--elevated)] px-4 py-4">
          <FieldLabel>指标开关与权重</FieldLabel>
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--elevated)]">
            {MARKET_INDICATOR_ITEMS.map((item) => (
              <div
                key={item.key}
                className="grid gap-3 border-b border-[var(--elevated)] px-3 py-3 last:border-b-0 lg:grid-cols-[minmax(180px,0.8fr)_minmax(220px,1fr)_minmax(140px,0.48fr)_96px] lg:items-start"
              >
                <div>
                  <div className="text-sm font-semibold text-[var(--text)]">{item.label}</div>
                  <div className="mt-1 text-[11px] text-[var(--faint)]">依赖：{item.dependencies}</div>
                </div>
                <div className="text-xs leading-6 text-[var(--muted)]">{item.hint}</div>
                <div>
                  <FieldLabel>权重</FieldLabel>
                  <NumberInput
                    value={config.dataSources.marketIndicators.indicators[item.key]?.weight ?? 0}
                    min={0}
                    max={5}
                    step={0.05}
                    onChange={(value) =>
                      setConfig((prev) =>
                        prev
                          ? {
                              ...prev,
                              dataSources: {
                                ...prev.dataSources,
                                marketIndicators: {
                                  ...prev.dataSources.marketIndicators,
                                  indicators: {
                                    ...prev.dataSources.marketIndicators.indicators,
                                    [item.key]: {
                                      ...prev.dataSources.marketIndicators.indicators[item.key],
                                      weight: Math.max(0, Math.min(5, Number.isFinite(value) ? value : 0)),
                                    },
                                  },
                                },
                              },
                            }
                          : prev,
                      )
                    }
                  />
                </div>
                <div className="lg:pt-6">
                  <CheckboxRow
                    checked={config.dataSources.marketIndicators.indicators[item.key]?.enabled ?? false}
                    onChange={(value) =>
                      setConfig((prev) =>
                        prev
                          ? {
                              ...prev,
                              dataSources: {
                                ...prev.dataSources,
                                marketIndicators: {
                                  ...prev.dataSources.marketIndicators,
                                  indicators: {
                                    ...prev.dataSources.marketIndicators.indicators,
                                    [item.key]: {
                                      ...prev.dataSources.marketIndicators.indicators[item.key],
                                      enabled: value,
                                    },
                                  },
                                },
                              },
                            }
                          : prev,
                      )
                    }
                  >
                    启用
                  </CheckboxRow>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-[var(--elevated)] px-4 py-4">
          <FieldLabel>市场环境预算基准</FieldLabel>
          <div className="mb-3 text-xs leading-6 text-[var(--muted)]">
            这些系数作为资产预算倾斜的基础输入，用来把研究结论转成更保守或更积极的入场节奏。
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <FieldLabel>过渡环境预算基准</FieldLabel>
              <NumberInput
                value={config.dataSources.marketIndicators.overlays.transitionalBuyScale}
                min={0.2}
                max={1}
                step={0.01}
                onChange={(value) =>
                  setConfig((prev) =>
                    prev
                      ? {
                          ...prev,
                          dataSources: {
                            ...prev.dataSources,
                            marketIndicators: {
                              ...prev.dataSources.marketIndicators,
                              overlays: {
                                ...prev.dataSources.marketIndicators.overlays,
                                transitionalBuyScale: Math.max(0.2, Math.min(1, value || 0.2)),
                              },
                            },
                          },
                        }
                      : prev,
                  )
                }
              />
            </div>

            <div>
              <FieldLabel>回避环境预算基准</FieldLabel>
              <NumberInput
                value={config.dataSources.marketIndicators.overlays.riskOffBuyScale}
                min={0.2}
                max={1}
                step={0.01}
                onChange={(value) =>
                  setConfig((prev) =>
                    prev
                      ? {
                          ...prev,
                          dataSources: {
                            ...prev.dataSources,
                            marketIndicators: {
                              ...prev.dataSources.marketIndicators,
                              overlays: {
                                ...prev.dataSources.marketIndicators.overlays,
                                riskOffBuyScale: Math.max(0.2, Math.min(1, value || 0.2)),
                              },
                            },
                          },
                        }
                      : prev,
                  )
                }
              />
            </div>

            <div>
              <FieldLabel>高波动资产预算基准</FieldLabel>
              <NumberInput
                value={config.dataSources.marketIndicators.overlays.highRiskBuyScale}
                min={0.1}
                max={1}
                step={0.01}
                onChange={(value) =>
                  setConfig((prev) =>
                    prev
                      ? {
                          ...prev,
                          dataSources: {
                            ...prev.dataSources,
                            marketIndicators: {
                              ...prev.dataSources.marketIndicators,
                              overlays: {
                                ...prev.dataSources.marketIndicators.overlays,
                                highRiskBuyScale: Math.max(0.1, Math.min(1, value || 0.1)),
                              },
                            },
                          },
                        }
                      : prev,
                  )
                }
              />
            </div>
          </div>
        </div>
      </div>
    </SubsectionCard>
  );
}
