import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

import {
  CheckboxRow,
  FieldLabel,
  NumberInput,
  SubsectionCard,
  type SettingsConfigSetter,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";

export function SettingsPriceFeedBlock(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  const { config, setConfig } = props;

  return (
    <SubsectionCard
      title="行情与缓存"
      description="决定行情来源、刷新频率，以及本地缓存多久算新鲜、多久还能兜底服务。"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <CheckboxRow
          checked={config.dataSources.priceFeed.enabled}
          onChange={(value) =>
            setConfig((prev) =>
              prev
                ? {
                    ...prev,
                    dataSources: {
                      ...prev.dataSources,
                      priceFeed: { ...prev.dataSources.priceFeed, enabled: value },
                    },
                  }
                : prev,
            )
          }
        >
          启用行情源
        </CheckboxRow>

        <div>
          <FieldLabel>缓存新鲜阈值（分钟）</FieldLabel>
          <NumberInput
            value={config.dataSources.priceFeed.marketCache.freshMinutes}
            min={1}
            max={180}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      dataSources: {
                        ...prev.dataSources,
                        priceFeed: {
                          ...prev.dataSources.priceFeed,
                          marketCache: {
                            ...prev.dataSources.priceFeed.marketCache,
                            freshMinutes: Math.max(1, Math.min(180, Math.trunc(value || 1))),
                          },
                        },
                      },
                    }
                  : prev,
              )
            }
          />
        </div>

        <div>
          <FieldLabel>陈旧缓存兜底窗口（小时）</FieldLabel>
          <NumberInput
            value={config.dataSources.priceFeed.marketCache.serveStaleHours}
            min={1}
            max={168}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      dataSources: {
                        ...prev.dataSources,
                        priceFeed: {
                          ...prev.dataSources.priceFeed,
                          marketCache: {
                            ...prev.dataSources.priceFeed.marketCache,
                            serveStaleHours: Math.max(1, Math.min(168, Math.trunc(value || 1))),
                          },
                        },
                      },
                    }
                  : prev,
              )
            }
          />
        </div>

        <div>
          <FieldLabel>原始行情保留天数</FieldLabel>
          <NumberInput
            value={config.dataSources.priceFeed.marketCache.rawRetentionDays}
            min={7}
            max={365}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      dataSources: {
                        ...prev.dataSources,
                        priceFeed: {
                          ...prev.dataSources.priceFeed,
                          marketCache: {
                            ...prev.dataSources.priceFeed.marketCache,
                            rawRetentionDays: Math.max(7, Math.min(365, Math.trunc(value || 7))),
                          },
                        },
                      },
                    }
                  : prev,
              )
            }
          />
        </div>
      </div>
    </SubsectionCard>
  );
}
