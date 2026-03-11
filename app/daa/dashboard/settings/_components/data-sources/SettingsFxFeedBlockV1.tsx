import type { DaaSystemConfigV2 } from "@/src/daa/config/systemConfigV2";

import {
  CheckboxRowV1,
  FieldLabelV1,
  FormInputV1,
  SubsectionCardV1,
  type SettingsConfigSetterV1,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitivesV1";

export function SettingsFxFeedBlockV1(props: {
  config: DaaSystemConfigV2;
  setConfig: SettingsConfigSetterV1;
}) {
  const { config, setConfig } = props;

  return (
    <SubsectionCardV1
      title="汇率换算"
      description="决定跨币种估值要跟踪哪些汇率，保证总览、工作台和策略实验室使用同一套换算口径。"
    >
      <div>
        <CheckboxRowV1
          checked={config.dataSources.fxFeed.enabled}
          onChange={(value) =>
            setConfig((prev) =>
              prev
                ? {
                    ...prev,
                    dataSources: {
                      ...prev.dataSources,
                      fxFeed: { ...prev.dataSources.fxFeed, enabled: value },
                    },
                  }
                : prev,
            )
          }
        >
          启用汇率源
        </CheckboxRowV1>

        <div style={{ marginTop: 14 }}>
          <FieldLabelV1>跟踪汇率币对</FieldLabelV1>
          <FormInputV1
            value={config.dataSources.fxFeed.pairs.join(", ")}
            onChange={(e) => {
              const pairs = e.target.value
                .split(/[,\s]+/g)
                .map((item) => item.trim().toUpperCase().replace(/-/g, "/"))
                .filter((item) => /^[A-Z]{3}\/[A-Z]{3}$/.test(item));
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      dataSources: {
                        ...prev.dataSources,
                        fxFeed: { ...prev.dataSources.fxFeed, pairs: [...new Set(pairs)] },
                      },
                    }
                  : prev,
              );
            }}
            placeholder="USD/CNY, USD/HKD"
          />
        </div>
      </div>
    </SubsectionCardV1>
  );
}
