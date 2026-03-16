import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

import {
  CheckboxRow,
  SectionCard,
  settingsGridCols2Style,
  type SettingsConfigSetter,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";

export function SettingsNotificationSection(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  const { config, setConfig } = props;

  return (
    <section id="settings-notification" className="scroll-mt-28">
      <SectionCard title="通知">
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
        </div>
      </SectionCard>
    </section>
  );
}
