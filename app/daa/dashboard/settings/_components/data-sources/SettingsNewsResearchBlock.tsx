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
    <SubsectionCard
      title="资讯聚合"
      description="聚合外部新闻与研报数据，由 AI 自主判断信号权重，无需手动配置。"
    >
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

        <CheckboxRow
          checked={config.dataSources.newsFeed.valuationEnabled !== false}
          onChange={(value) =>
            setConfig((prev) =>
              prev
                ? {
                    ...prev,
                    dataSources: {
                      ...prev.dataSources,
                      newsFeed: { ...prev.dataSources.newsFeed, valuationEnabled: value },
                    },
                  }
                : prev,
            )
          }
        >
          估值分析（AI 自动判断是否采纳估值信号）
        </CheckboxRow>
      </div>
    </SubsectionCard>
  );
}
