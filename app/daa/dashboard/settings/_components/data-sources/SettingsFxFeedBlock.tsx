import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

import {
  CheckboxRow,
  FieldLabel,
  FormInput,
  SubsectionCard,
  type SettingsConfigSetter,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";

export function SettingsFxFeedBlock(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  const { config, setConfig } = props;

  return (
    <SubsectionCard
      title="汇率换算"
      description="决定跨币种估值要跟踪哪些汇率，保证工作台、交易记录和研究输出使用同一套换算口径。"
    >
      <div>
        <CheckboxRow
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
        </CheckboxRow>

        <div style={{ marginTop: 14 }}>
          <FieldLabel>跟踪汇率币对</FieldLabel>
          <FormInput
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
    </SubsectionCard>
  );
}
