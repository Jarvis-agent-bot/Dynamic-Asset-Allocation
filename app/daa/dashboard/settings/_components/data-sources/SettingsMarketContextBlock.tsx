import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

import {
  CheckboxRow,
  FieldLabel,
  MARKET_INDICATOR_ITEMS_,
  NumberInput,
  SubsectionCard,
  settingsGridCols2Style,
  settingsGridCols3Style,
  type SettingsConfigSetter,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";

export function SettingsMarketContextBlock(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  const { config, setConfig } = props;

  return (
    <SubsectionCard
      title="市场状态层"
      description="把各市场的温度、风格和风险提示整理成统一上下文，只影响执行节奏和解释层，不直接改写底层行情。"
    >
      <div
        style={{
          padding: 16,
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "linear-gradient(180deg, rgba(12,18,30,0.84), rgba(8,12,20,0.76))",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>市场状态层</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
              现在按市场拆分为美股、港股 / 中概、加密与宏观防御四组环境，只影响对应市场的买入执行节奏、风险提示与 AI 解读语境。
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

        <div style={{ ...settingsGridCols2Style, marginTop: 16 }}>
          <div>
            <FieldLabel>刷新间隔（分钟）</FieldLabel>
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
          </div>

          <div style={{ gridColumn: "1 / -1", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)", padding: "10px 12px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>市场划分说明</div>
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
              美股使用恐慌指数与成长/大盘比；港股 / 中概使用港中概波动率与中概互联/大盘比；加密使用比特币/以太坊比与比特币波动率；宏观防御使用金银比作为辅助观察。
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--elevated)",
            fontSize: 12,
            color: "var(--muted)",
            lineHeight: 1.7,
          }}
        >
          数据源对照：美股恐慌指数 → ^VIX；美股成长/大盘比 → QQQ / SPY；港中概波动率 → FXI；中概互联/大盘比 → KWEB / FXI；比特币/以太坊比 → BTC-USD / ETH-USD；比特币波动率 → BTC-USD；金银比 → GC=F / SI=F。
        </div>

        <div style={{ marginTop: 16 }}>
          <FieldLabel>指标开关与权重</FieldLabel>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {MARKET_INDICATOR_ITEMS_.map((item) => (
              <div
                key={item.key}
                style={{
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "rgba(255,255,255,0.02)",
                  padding: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{item.label}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>{item.hint}</div>
                    <div style={{ marginTop: 6, fontSize: 11, color: "var(--faint)" }}>依赖：{item.dependencies}</div>
                  </div>
                  <CheckboxRow
                    checked={config.dataSources.marketIndicators.indicators[item.key].enabled}
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
                <div style={{ marginTop: 12 }}>
                  <FieldLabel>权重</FieldLabel>
                  <NumberInput
                    value={config.dataSources.marketIndicators.indicators[item.key].weight}
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
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <FieldLabel>市场环境执行系数</FieldLabel>
          <div style={{ marginBottom: 10, fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
            这些系数只影响不同市场环境下的买入力度，用来把研究结论转成更保守或更积极的执行节奏。
          </div>
          <div style={settingsGridCols3Style}>
            <div>
              <FieldLabel>过渡环境买入执行系数</FieldLabel>
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
              <FieldLabel>偏防守环境买入执行系数</FieldLabel>
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
              <FieldLabel>高波动资产买入执行系数</FieldLabel>
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
