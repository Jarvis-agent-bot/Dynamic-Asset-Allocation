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
    <SubsectionCard title="市场状态层">
      <div
        style={{
          padding: 16,
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "linear-gradient(180deg, var(--surface), var(--surface))",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>市场状态层</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
              现在按市场拆分为美股、港股 / 中概、加密、宏观防御与宏观政策环境，只影响对应市场的买入执行节奏、风险提示与 AI 解读语境。
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
            <div style={{ marginTop: 6, fontSize: 11, color: "var(--faint)", lineHeight: 1.5 }}>
              控制市场状态快照多久算新鲜；定时任务触发频率由部署 cron 控制。
            </div>
          </div>

          <div style={{ gridColumn: "1 / -1", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", padding: "10px 12px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>市场划分说明</div>
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
              美股使用恐慌指数、成长/大盘比与市场广度；港股 / 中概使用港中概波动率与中概互联/大盘比；加密使用比特币/以太坊比与比特币波动率；宏观层使用金银比、收益率曲线、美元、信用、通胀代理、PPI、政策利率与美联储资产负债表。
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
          数据源对照：VIX → ^VIX；QQQ/SPY → QQQ / SPY；FXI 波动率 → FXI；KWEB/FXI → KWEB / FXI；BTC/ETH → BTC-USD / ETH-USD；BTC 波动率 → BTC-USD；金银比 → GC=F / SI=F；收益率曲线 → IEF / SHY；美元 → UUP；信用利差 → HYG / LQD；通胀预期 → TIP / IEF；市场广度 → RSP / SPY；PPI / 政策利率 / 缩表 → FRED。
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
                  background: "var(--surface)",
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
          <FieldLabel>市场环境预算基准</FieldLabel>
          <div style={{ marginBottom: 10, fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
            这些系数作为资产预算倾斜的基础输入，用来把研究结论转成更保守或更积极的入场节奏。
          </div>
          <div style={settingsGridCols3Style}>
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
