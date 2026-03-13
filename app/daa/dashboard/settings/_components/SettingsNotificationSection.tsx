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
        <div style={settingsGridCols2Style}>
          <CheckboxRow
            checked={config.notification.email.onSuggestionGenerated}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      notification: {
                        ...prev.notification,
                        email: {
                          ...prev.notification.email,
                          onSuggestionGenerated: value,
                        },
                      },
                    }
                  : prev,
              )
            }
          >
            再平衡建议生成时发送邮件
          </CheckboxRow>

          <CheckboxRow
            checked={config.notification.email.dailyReport}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      notification: {
                        ...prev.notification,
                        email: {
                          ...prev.notification.email,
                          dailyReport: value,
                        },
                      },
                    }
                  : prev,
              )
            }
          >
            发送每日分析报告
          </CheckboxRow>

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
            启用 Telegram
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
        </div>
      </SectionCard>
    </section>
  );
}
