import type { DaaSystemConfigV2 } from "@/src/daa/config/systemConfigV2";

import {
  CheckboxRowV1,
  SectionCardV1,
  settingsGridCols2StyleV1,
  type SettingsConfigSetterV1,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitivesV1";

export function SettingsNotificationSectionV1(props: {
  config: DaaSystemConfigV2;
  setConfig: SettingsConfigSetterV1;
}) {
  const { config, setConfig } = props;

  return (
    <section id="settings-notification" className="scroll-mt-28">
      <SectionCardV1 title="通知">
        <div style={settingsGridCols2StyleV1}>
          <CheckboxRowV1
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
          </CheckboxRowV1>

          <CheckboxRowV1
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
          </CheckboxRowV1>

          <CheckboxRowV1
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
          </CheckboxRowV1>

          <CheckboxRowV1
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
          </CheckboxRowV1>
        </div>
      </SectionCardV1>
    </section>
  );
}
