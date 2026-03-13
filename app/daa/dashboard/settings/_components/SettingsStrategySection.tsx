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
                      rebalanceStrategy: { ...prev.rebalanceStrategy, autoGenerateEnabled: value },
                    }
                  : prev,
              )
            }
          >
            自动模式（自动生成建议 + 通知）
          </CheckboxRow>

          <div>
            <FieldLabel>通知邮箱</FieldLabel>
            <FormInput
              value={config.rebalanceStrategy.notifyEmailTo}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        rebalanceStrategy: {
                          ...prev.rebalanceStrategy,
                          notifyEmailTo: e.target.value.trim(),
                        },
                      }
                    : prev,
                )
              }
              placeholder="name@example.com"
            />
          </div>

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
    </section>
  );
}
