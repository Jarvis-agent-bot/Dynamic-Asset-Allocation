import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

import {
  CheckboxRow,
  FieldLabel,
  FormSelect,
  SectionCard,
  settingsGridCols2Style,
  type SettingsConfigSetter,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";

const UTC_HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => {
  const beijingH = (h + 8) % 24;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { value: h, label: `UTC ${pad(h)}:00（北京 ${pad(beijingH)}:00）` };
});

export function SettingsNotificationSection(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  const { config, setConfig } = props;

  return (
    <section id="settings-notification" className="scroll-mt-28">
      <SectionCard title="通知">
        {/* Daily analysis time */}
        <div style={{ marginBottom: 20 }}>
          <FieldLabel>每日分析 &amp; 报告发送时间</FieldLabel>
          <FormSelect
            value={config.notification.dailyAnalysisHourUtc}
            onChange={(e) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      notification: {
                        ...prev.notification,
                        dailyAnalysisHourUtc: Number(e.target.value),
                      },
                    }
                  : prev,
              )
            }
            style={{ maxWidth: 280 }}
          >
            {UTC_HOUR_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </FormSelect>
          <div style={{ marginTop: 5, fontSize: 11, color: "var(--faint)" }}>
            每日分析与每日报告在同一时刻触发，修改后次小时生效。
          </div>
        </div>

        {/* Telegram */}
        <h4 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600, color: "var(--text-secondary, #666)" }}>Telegram</h4>
        <div style={settingsGridCols2Style}>
          <CheckboxRow
            checked={config.notification.telegram.enabled}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      notification: {
                        ...prev.notification,
                        telegram: {
                          ...prev.notification.telegram,
                          enabled: value,
                        },
                      },
                    }
                  : prev,
              )
            }
          >
            启用 Telegram 通知
          </CheckboxRow>

          <CheckboxRow
            checked={config.notification.telegram.onDriftTrigger}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      notification: {
                        ...prev.notification,
                        telegram: {
                          ...prev.notification.telegram,
                          onDriftTrigger: value,
                        },
                      },
                    }
                  : prev,
              )
            }
          >
            偏移触发时通知
          </CheckboxRow>

          <CheckboxRow
            checked={config.notification.telegram.onSuggestionGenerated}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      notification: {
                        ...prev.notification,
                        telegram: {
                          ...prev.notification.telegram,
                          onSuggestionGenerated: value,
                        },
                      },
                    }
                  : prev,
              )
            }
          >
            再平衡建议生成时通知
          </CheckboxRow>

          <CheckboxRow
            checked={config.notification.telegram.onTradeExecuted}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      notification: {
                        ...prev.notification,
                        telegram: {
                          ...prev.notification.telegram,
                          onTradeExecuted: value,
                        },
                      },
                    }
                  : prev,
              )
            }
          >
            交易执行时通知
          </CheckboxRow>

          <CheckboxRow
            checked={config.notification.telegram.dailyReport}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      notification: {
                        ...prev.notification,
                        telegram: {
                          ...prev.notification.telegram,
                          dailyReport: value,
                        },
                      },
                    }
                  : prev,
              )
            }
          >
            每日分析报告
          </CheckboxRow>
        </div>

        {/* Feishu */}
        <h4 style={{ margin: "16px 0 8px", fontSize: 14, fontWeight: 600, color: "var(--text-secondary, #666)" }}>飞书</h4>
        <div style={settingsGridCols2Style}>
          <CheckboxRow
            checked={config.notification.feishu.enabled}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      notification: {
                        ...prev.notification,
                        feishu: {
                          ...prev.notification.feishu,
                          enabled: value,
                        },
                      },
                    }
                  : prev,
              )
            }
          >
            启用飞书通知
          </CheckboxRow>

          <CheckboxRow
            checked={config.notification.feishu.onDriftTrigger}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      notification: {
                        ...prev.notification,
                        feishu: {
                          ...prev.notification.feishu,
                          onDriftTrigger: value,
                        },
                      },
                    }
                  : prev,
              )
            }
          >
            偏移触发时通知
          </CheckboxRow>

          <CheckboxRow
            checked={config.notification.feishu.onSuggestionGenerated}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      notification: {
                        ...prev.notification,
                        feishu: {
                          ...prev.notification.feishu,
                          onSuggestionGenerated: value,
                        },
                      },
                    }
                  : prev,
              )
            }
          >
            再平衡建议生成时通知
          </CheckboxRow>

          <CheckboxRow
            checked={config.notification.feishu.onTradeExecuted}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      notification: {
                        ...prev.notification,
                        feishu: {
                          ...prev.notification.feishu,
                          onTradeExecuted: value,
                        },
                      },
                    }
                  : prev,
              )
            }
          >
            交易执行时通知
          </CheckboxRow>

          <CheckboxRow
            checked={config.notification.feishu.dailyReport}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      notification: {
                        ...prev.notification,
                        feishu: {
                          ...prev.notification.feishu,
                          dailyReport: value,
                        },
                      },
                    }
                  : prev,
              )
            }
          >
            每日分析报告
          </CheckboxRow>
        </div>
      </SectionCard>
    </section>
  );
}
