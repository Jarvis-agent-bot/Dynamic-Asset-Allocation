import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

import {
  CheckboxRow,
  SubsectionCard,
  type SettingsConfigSetter,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";

export function SettingsNewsResearchBlock(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  const { config, setConfig } = props;

  return (
    <SubsectionCard title="资讯聚合">
      <div>
        <CheckboxRow
          checked={config.dataSources.newsFeed.enabled}
          onChange={(value) =>
            setConfig((prev) =>
              prev
                ? {
                    ...prev,
                    dataSources: {
                      ...prev.dataSources,
                      newsFeed: { ...prev.dataSources.newsFeed, enabled: value },
                    },
                  }
                : prev,
            )
          }
        >
          启用资讯源
        </CheckboxRow>
      </div>
    </SubsectionCard>
  );
}
