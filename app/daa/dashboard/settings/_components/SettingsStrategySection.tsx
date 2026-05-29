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

const DEFAULT_AI_TARGET_WEIGHT_POOL: NonNullable<DaaSystemConfig["aiTargetWeightPool"]> = {
  enabled: true,
  minConfidence: 0,
};

export function SettingsStrategySection(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  const { config, setConfig } = props;
  const policy = config.policy;
  const reviewFrequency = policy.review.frequency;
  const usesReviewDueDay = reviewFrequency !== "every_3_days" && reviewFrequency !== "weekly";

  return (
    <>
      <SectionCard title="Policy Engine">
        <div style={settingsGridCols2Style}>
          <CheckboxRow
            checked={policy.enabled}
            onChange={(value) =>
              setConfig((prev) =>
                prev ? { ...prev, policy: { ...prev.policy, enabled: value } } : prev,
              )
            }
          >
            启用策略引擎
          </CheckboxRow>

          <CheckboxRow
            checked={policy.shadowMode}
            onChange={(value) =>
              setConfig((prev) =>
                prev ? { ...prev, policy: { ...prev.policy, shadowMode: value } } : prev,
              )
            }
          >
            影子模式
          </CheckboxRow>

          <CheckboxRow
            checked={policy.review.enabled}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      policy: {
                        ...prev.policy,
                        review: { ...prev.policy.review, enabled: value },
                      },
                    }
                  : prev,
              )
            }
          >
            启用定期组合复盘
          </CheckboxRow>

          <div>
            <FieldLabel>定期频率</FieldLabel>
            <FormSelect
              value={policy.review.frequency}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        policy: {
                          ...prev.policy,
                          review: {
                            ...prev.policy.review,
                            frequency: e.target.value as DaaSystemConfig["policy"]["review"]["frequency"],
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

          {usesReviewDueDay ? (
            <div>
              <FieldLabel>复盘日（1-28）</FieldLabel>
              <NumberInput
                value={policy.review.dayOfMonth}
                min={1}
                max={28}
                onChange={(value) =>
                  setConfig((prev) =>
                    prev
                      ? {
                          ...prev,
                          policy: {
                            ...prev.policy,
                            review: {
                              ...prev.policy.review,
                              dayOfMonth: Math.max(1, Math.min(28, Math.trunc(value || 1))),
                            },
                          },
                        }
                      : prev,
                  )
                }
              />
            </div>
          ) : null}

          <div>
            <FieldLabel>自动分析时间（UTC）</FieldLabel>
            <FormInput
              value={policy.review.scheduledTimeUtc}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        policy: {
                          ...prev.policy,
                          review: { ...prev.policy.review, scheduledTimeUtc: e.target.value },
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
              value={policy.review.timezone}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        policy: {
                          ...prev.policy,
                          review: { ...prev.policy.review, timezone: e.target.value },
                        },
                      }
                    : prev,
                )
              }
              placeholder="Asia/Shanghai"
            />
          </div>

          <CheckboxRow
            checked={policy.drift.enabled}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      policy: {
                        ...prev.policy,
                        drift: { ...prev.policy.drift, enabled: value },
                      },
                    }
                  : prev,
              )
            }
          >
            启用偏移监控
          </CheckboxRow>

          <div>
            <FieldLabel>行动外圈 (%)</FieldLabel>
            <NumberInput
              value={policy.drift.outerBandPct * 100}
              min={0.5}
              max={50}
              step={0.5}
              onChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        policy: {
                          ...prev.policy,
                          drift: {
                            ...prev.policy.drift,
                            outerBandPct: Math.max(0.005, Math.min(0.5, value / 100)),
                          },
                        },
                      }
                    : prev,
                )
              }
            />
          </div>

          <div>
            <FieldLabel>回归内圈 (%)</FieldLabel>
            <NumberInput
              value={policy.drift.innerBandPct * 100}
              min={0.1}
              max={30}
              step={0.5}
              onChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        policy: {
                          ...prev.policy,
                          drift: {
                            ...prev.policy.drift,
                            innerBandPct: Math.max(0.001, Math.min(0.3, value / 100)),
                          },
                        },
                      }
                    : prev,
                )
              }
            />
          </div>

          <div>
            <FieldLabel>建议去重窗口（小时）</FieldLabel>
            <NumberInput
              value={policy.throttle.proposalDedupeWindowHours}
              min={1}
              max={720}
              step={1}
              onChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        policy: {
                          ...prev.policy,
                          throttle: {
                            ...prev.policy.throttle,
                            proposalDedupeWindowHours: Math.max(1, Math.trunc(value || 1)),
                          },
                        },
                      }
                    : prev,
                )
              }
            />
          </div>

          <div>
            <FieldLabel>自动执行冷静期（小时）</FieldLabel>
            <NumberInput
              value={policy.throttle.autoExecutionCooldownHours}
              min={1}
              max={720}
              step={1}
              onChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        policy: {
                          ...prev.policy,
                          throttle: {
                            ...prev.policy.throttle,
                            autoExecutionCooldownHours: Math.max(1, Math.trunc(value || 1)),
                          },
                        },
                      }
                    : prev,
                )
              }
            />
          </div>

          <div>
            <FieldLabel>生成建议行动分</FieldLabel>
            <NumberInput
              value={policy.actionScore.proposalThreshold}
              min={0}
              max={100}
              step={1}
              onChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        policy: {
                          ...prev.policy,
                          actionScore: {
                            ...prev.policy.actionScore,
                            proposalThreshold: Math.max(0, Math.min(100, value || 0)),
                          },
                        },
                      }
                    : prev,
                )
              }
            />
          </div>

          <div>
            <FieldLabel>自动执行行动分</FieldLabel>
            <NumberInput
              value={policy.actionScore.autoExecuteThreshold}
              min={0}
              max={100}
              step={1}
              onChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        policy: {
                          ...prev.policy,
                          actionScore: {
                            ...prev.policy.actionScore,
                            autoExecuteThreshold: Math.max(0, Math.min(100, value || 0)),
                          },
                        },
                      }
                    : prev,
                )
              }
            />
          </div>

          <CheckboxRow
            checked={policy.execution.autoGenerateEnabled}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      policy: {
                        ...prev.policy,
                        execution: {
                          ...prev.policy.execution,
                          autoGenerateEnabled: value,
                          autoExecuteEnabled: value ? prev.policy.execution.autoExecuteEnabled : false,
                        },
                      },
                    }
                  : prev,
              )
            }
          >
            自动生成建议
          </CheckboxRow>

          {policy.execution.autoGenerateEnabled && (
            <div style={{ gridColumn: "1 / -1", marginTop: -4 }}>
              <div style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "12px 16px",
                background: "rgba(8,12,20,0.3)",
              }}>
                <CheckboxRow
                  checked={policy.execution.autoExecuteEnabled}
                  onChange={(value) =>
                    setConfig((prev) =>
                      prev
                        ? {
                            ...prev,
                            policy: {
                              ...prev.policy,
                              execution: { ...prev.policy.execution, autoExecuteEnabled: value },
                            },
                          }
                        : prev,
                    )
                  }
                >
                  自动执行通过风控的建议
                </CheckboxRow>

                {policy.execution.autoExecuteEnabled && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                      <div>
                        <FieldLabel>单次执行上限 (% NAV)</FieldLabel>
                        <NumberInput
                          value={policy.execution.maxSingleOrderPctOfNav * 100}
                          min={1}
                          max={50}
                          step={1}
                          onChange={(value) =>
                            setConfig((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    policy: {
                                      ...prev.policy,
                                      execution: {
                                        ...prev.policy.execution,
                                        maxSingleOrderPctOfNav: Math.max(0.01, Math.min(0.5, value / 100)),
                                      },
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
        </div>
      </SectionCard>

      <SectionCard title="AI 目标权重池">
        <div style={settingsGridCols2Style}>
          <CheckboxRow
            checked={config.aiTargetWeightPool?.enabled !== false}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      aiTargetWeightPool: {
                        ...(prev.aiTargetWeightPool ?? DEFAULT_AI_TARGET_WEIGHT_POOL),
                        enabled: value,
                      },
                    }
                  : prev,
              )
            }
          >
            将 Agent 输出的目标权重落到资产 targetWeightHint
          </CheckboxRow>

          <div>
            <FieldLabel>最低置信度</FieldLabel>
            <NumberInput
              value={config.aiTargetWeightPool?.minConfidence ?? 0}
              min={0}
              max={100}
              step={1}
              onChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        aiTargetWeightPool: {
                          ...(prev.aiTargetWeightPool ?? DEFAULT_AI_TARGET_WEIGHT_POOL),
                          minConfidence: Math.max(0, Math.min(100, value || 0)),
                        },
                      }
                    : prev,
                )
              }
            />
            <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.6, color: "var(--faint)" }}>
              Agent 输出 targetAllocationPlan 时，只有置信度 ≥ 此阈值的 intent 才会写入持久目标权重；后续 BUY/SELL 通过 cycle 的 drift 计算 + AutomationAuthority 统一执行，不再走规则触发器。
            </div>
          </div>
        </div>
      </SectionCard>
    </>
  );
}
