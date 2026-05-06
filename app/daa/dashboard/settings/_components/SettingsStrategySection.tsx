import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

import {
  CheckboxRow,
  FieldLabel,
  FormInput,
  FormSelect,
  NumberInput,
  SectionCard,
  settingsGridCols2Style,
  type SettingsConfigSetter,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";

export function SettingsStrategySection(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  const { config, setConfig } = props;

  return (
    <section id="settings-strategy" className="scroll-mt-28">
      <SectionCard title="再平衡策略" description="支持定期触发和偏移触发，两者可并行启用。">
        <div style={settingsGridCols2Style}>
          <CheckboxRow
            checked={config.rebalanceStrategy.calendar.enabled}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      rebalanceStrategy: {
                        ...prev.rebalanceStrategy,
                        calendar: { ...prev.rebalanceStrategy.calendar, enabled: value },
                      },
                    }
                  : prev,
              )
            }
          >
            启用定期再平衡
          </CheckboxRow>

          <div>
            <FieldLabel>定期频率</FieldLabel>
            <FormSelect
              value={config.rebalanceStrategy.calendar.frequency}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        rebalanceStrategy: {
                          ...prev.rebalanceStrategy,
                          calendar: {
                            ...prev.rebalanceStrategy.calendar,
                            frequency: e.target.value as DaaSystemConfig["rebalanceStrategy"]["calendar"]["frequency"],
                          },
                        },
                      }
                    : prev,
                )
              }
            >
              <option value="every_3_days">每三天</option>
              <option value="weekly">每周</option>
              <option value="monthly">每月</option>
              <option value="quarterly">每季度</option>
              <option value="semi_annual">每半年</option>
              <option value="annual">每年</option>
            </FormSelect>
          </div>

          <div>
            <FieldLabel>执行日（1-28）</FieldLabel>
            <NumberInput
              value={config.rebalanceStrategy.calendar.dayOfMonth}
              min={1}
              max={28}
              onChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        rebalanceStrategy: {
                          ...prev.rebalanceStrategy,
                          calendar: {
                            ...prev.rebalanceStrategy.calendar,
                            dayOfMonth: Math.max(1, Math.min(28, Math.trunc(value || 1))),
                          },
                        },
                      }
                    : prev,
                )
              }
            />
          </div>

          <CheckboxRow
            checked={config.rebalanceStrategy.drift.enabled}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      rebalanceStrategy: {
                        ...prev.rebalanceStrategy,
                        drift: { ...prev.rebalanceStrategy.drift, enabled: value },
                      },
                    }
                  : prev,
              )
            }
          >
            启用偏移量再平衡
          </CheckboxRow>

          <div>
            <FieldLabel>偏移阈值 (%)</FieldLabel>
            <NumberInput
              value={config.rebalanceStrategy.drift.thresholdPct * 100}
              min={1}
              max={50}
              step={0.5}
              onChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        rebalanceStrategy: {
                          ...prev.rebalanceStrategy,
                          drift: {
                            ...prev.rebalanceStrategy.drift,
                            thresholdPct: Math.max(0.01, Math.min(0.5, value / 100)),
                          },
                        },
                      }
                    : prev,
                )
              }
            />
          </div>

          <div>
            <FieldLabel>检查频率</FieldLabel>
            <FormSelect
              value={config.rebalanceStrategy.drift.checkFrequency}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        rebalanceStrategy: {
                          ...prev.rebalanceStrategy,
                          drift: {
                            ...prev.rebalanceStrategy.drift,
                            checkFrequency: e.target.value as "daily" | "weekly",
                          },
                        },
                      }
                    : prev,
                )
              }
            >
              <option value="daily">每日</option>
              <option value="weekly">每周</option>
            </FormSelect>
          </div>

          <div>
            <FieldLabel>冷静期（小时）</FieldLabel>
            <NumberInput
              value={config.rebalanceStrategy.cooldownHours}
              min={1}
              max={720}
              onChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        rebalanceStrategy: {
                          ...prev.rebalanceStrategy,
                          cooldownHours: Math.max(1, Math.trunc(value || 1)),
                        },
                      }
                    : prev,
                )
              }
            />
          </div>

          <div>
            <FieldLabel>自动分析时间（UTC）</FieldLabel>
            <FormInput
              value={config.rebalanceStrategy.analysisTimeUtc}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        rebalanceStrategy: {
                          ...prev.rebalanceStrategy,
                          analysisTimeUtc: e.target.value,
                        },
                      }
                    : prev,
                )
              }
              placeholder="00:20"
            />
            <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.6, color: "var(--faint)" }}>
              当前调度按整点 UTC 轮询；如果填写 10:51，实际会在 11:00 UTC 的窗口执行。若希望执行时间更直观，建议直接填写整点。
            </div>
          </div>

          <div>
            <FieldLabel>时区</FieldLabel>
            <FormInput
              value={config.rebalanceStrategy.timezone}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        rebalanceStrategy: {
                          ...prev.rebalanceStrategy,
                          timezone: e.target.value,
                        },
                      }
                    : prev,
                )
              }
              placeholder="Asia/Shanghai"
            />
          </div>

          <CheckboxRow
            checked={config.rebalanceStrategy.autoGenerateEnabled}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      rebalanceStrategy: {
                        ...prev.rebalanceStrategy,
                        autoGenerateEnabled: value,
                        ...(value ? {} : { autoExecuteEnabled: false }),
                      },
                    }
                  : prev,
              )
            }
          >
            自动模式（自动生成再平衡建议）
          </CheckboxRow>

          {config.rebalanceStrategy.autoGenerateEnabled && (
            <div style={{ gridColumn: "1 / -1", marginTop: -4 }}>
              <div style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "12px 16px",
                background: "rgba(8,12,20,0.3)",
              }}>
                <CheckboxRow
                  checked={config.rebalanceStrategy.autoExecuteEnabled ?? false}
                  onChange={(value) =>
                    setConfig((prev) =>
                      prev
                        ? {
                            ...prev,
                            rebalanceStrategy: {
                              ...prev.rebalanceStrategy,
                              autoExecuteEnabled: value,
                            },
                          }
                        : prev,
                    )
                  }
                >
                  自动驾驶（风控通过后自动执行调仓）
                </CheckboxRow>

                {config.rebalanceStrategy.autoExecuteEnabled && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                      <div>
                        <FieldLabel>单次执行上限 (% NAV)</FieldLabel>
                        <NumberInput
                          value={config.rebalanceStrategy.autoExecuteMaxSinglePct ?? 10}
                          min={1}
                          max={50}
                          step={1}
                          onChange={(value) =>
                            setConfig((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    rebalanceStrategy: {
                                      ...prev.rebalanceStrategy,
                                      autoExecuteMaxSinglePct: Math.max(1, Math.min(50, value || 10)),
                                    },
                                  }
                                : prev,
                            )
                          }
                        />
                      </div>
                    </div>
                    <div style={{
                      marginTop: 10,
                      padding: "8px 12px",
                      background: "rgba(234, 179, 8, 0.08)",
                      border: "1px solid rgba(234, 179, 8, 0.2)",
                      borderRadius: 8,
                      fontSize: 12,
                      lineHeight: 1.6,
                      color: "var(--muted)",
                    }}>
                      自动驾驶开启后，系统将在 cron 触发生成提案并通过风控检查后自动执行交易，无需手动确认。执行结果会通过已配置的通知渠道推送。
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ gridColumn: "1 / -1" }}>
            <FieldLabel>AI 关注重点</FieldLabel>
            <FormInput
              value={config.rebalanceStrategy.analysisFocus}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        rebalanceStrategy: {
                          ...prev.rebalanceStrategy,
                          analysisFocus: e.target.value,
                        },
                      }
                    : prev,
                )
              }
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="观察列表自动建仓" description="技术 + 估值信号同时达标时，为观察列表中的资产自动生成 BUY 提案。仅加入观察列表不会自动买入；还需要在单个资产页面显式开启 auto-entry。">
        <div style={settingsGridCols2Style}>
          <CheckboxRow
            checked={config.watchlistEntry?.enabled ?? false}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      watchlistEntry: {
                        ...(prev.watchlistEntry ?? {
                          enabled: false,
                          maxPerCycle: 2,
                          defaultRules: { minTechnicalScore: 65, minValuationScore: 60, minFusionScore: 62, requireStrongMomentum: false },
                          notionalCashCapPct: 0.3,
                        }),
                        enabled: value,
                      },
                    }
                  : prev,
              )
            }
          >
            启用观察列表自动建仓
          </CheckboxRow>

          <div>
            <FieldLabel>单次 cron 最多触发 (个)</FieldLabel>
            <NumberInput
              value={config.watchlistEntry?.maxPerCycle ?? 2}
              min={1}
              max={10}
              step={1}
              onChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        watchlistEntry: {
                          ...(prev.watchlistEntry ?? {
                            enabled: false,
                            maxPerCycle: 2,
                            defaultRules: { minTechnicalScore: 65, minValuationScore: 60, minFusionScore: 62, requireStrongMomentum: false },
                            notionalCashCapPct: 0.3,
                          }),
                          maxPerCycle: Math.max(1, Math.min(10, value || 2)),
                        },
                      }
                    : prev,
                )
              }
            />
            <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.6, color: "var(--faint)" }}>
              当前语义：`Watchlist` 只是候选池。系统只会自动买入已显式开启 auto-entry、具备有效目标权重、价格 / FX 正常且不在冷静期内的观察标的。
            </div>
          </div>

          <div>
            <FieldLabel>单次建仓占可用现金上限 (%)</FieldLabel>
            <NumberInput
              value={Math.round(((config.watchlistEntry?.notionalCashCapPct ?? 0.3) * 100))}
              min={5}
              max={100}
              step={5}
              onChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        watchlistEntry: {
                          ...(prev.watchlistEntry ?? {
                            enabled: false,
                            maxPerCycle: 2,
                            defaultRules: { minTechnicalScore: 65, minValuationScore: 60, minFusionScore: 62, requireStrongMomentum: false },
                            notionalCashCapPct: 0.3,
                          }),
                          notionalCashCapPct: Math.max(0.05, Math.min(1, (value || 30) / 100)),
                        },
                      }
                    : prev,
                )
              }
            />
          </div>

          <div>
            <FieldLabel>默认技术阈值</FieldLabel>
            <NumberInput
              value={config.watchlistEntry?.defaultRules.minTechnicalScore ?? 65}
              min={0}
              max={100}
              step={1}
              onChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        watchlistEntry: {
                          ...(prev.watchlistEntry ?? {
                            enabled: false,
                            maxPerCycle: 2,
                            defaultRules: { minTechnicalScore: 65, minValuationScore: 60, minFusionScore: 62, requireStrongMomentum: false },
                            notionalCashCapPct: 0.3,
                          }),
                          defaultRules: {
                            ...(prev.watchlistEntry?.defaultRules ?? { minTechnicalScore: 65, minValuationScore: 60, minFusionScore: 62, requireStrongMomentum: false }),
                            minTechnicalScore: Math.max(0, Math.min(100, value || 65)),
                          },
                        },
                      }
                    : prev,
                )
              }
            />
          </div>

          <div>
            <FieldLabel>默认估值阈值</FieldLabel>
            <NumberInput
              value={config.watchlistEntry?.defaultRules.minValuationScore ?? 60}
              min={0}
              max={100}
              step={1}
              onChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        watchlistEntry: {
                          ...(prev.watchlistEntry ?? {
                            enabled: false,
                            maxPerCycle: 2,
                            defaultRules: { minTechnicalScore: 65, minValuationScore: 60, minFusionScore: 62, requireStrongMomentum: false },
                            notionalCashCapPct: 0.3,
                          }),
                          defaultRules: {
                            ...(prev.watchlistEntry?.defaultRules ?? { minTechnicalScore: 65, minValuationScore: 60, minFusionScore: 62, requireStrongMomentum: false }),
                            minValuationScore: Math.max(0, Math.min(100, value || 60)),
                          },
                        },
                      }
                    : prev,
                )
              }
            />
          </div>

          <div>
            <FieldLabel>默认融合阈值</FieldLabel>
            <NumberInput
              value={config.watchlistEntry?.defaultRules.minFusionScore ?? 62}
              min={0}
              max={100}
              step={1}
              onChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        watchlistEntry: {
                          ...(prev.watchlistEntry ?? {
                            enabled: false,
                            maxPerCycle: 2,
                            defaultRules: { minTechnicalScore: 65, minValuationScore: 60, minFusionScore: 62, requireStrongMomentum: false },
                            notionalCashCapPct: 0.3,
                          }),
                          defaultRules: {
                            ...(prev.watchlistEntry?.defaultRules ?? { minTechnicalScore: 65, minValuationScore: 60, minFusionScore: 62, requireStrongMomentum: false }),
                            minFusionScore: Math.max(0, Math.min(100, value || 62)),
                          },
                        },
                      }
                    : prev,
                )
              }
            />
          </div>

          <div style={{
            gridColumn: "1 / -1",
            marginTop: 4,
            padding: "8px 12px",
            background: "rgba(56, 189, 248, 0.06)",
            border: "1px solid rgba(56, 189, 248, 0.18)",
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.6,
            color: "var(--muted)",
          }}>
            仅对观察列表中「未持仓」、「过冷静期」且「设置了目标权重」的资产生效。到 Portfolio 详情页可为每个资产单独调节阈值与冷静期。
          </div>
        </div>
      </SectionCard>
    </section>
  );
}
