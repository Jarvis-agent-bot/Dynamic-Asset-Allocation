import type { DaaSystemConfigV2 } from "@/src/daa/config/systemConfigV2";

import {
  CheckboxRowV1,
  FieldLabelV1,
  FormInputV1,
  NumberInputV1,
  SubsectionCardV1,
  settingsGridCols2StyleV1,
  type SettingsConfigSetterV1,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitivesV1";

export function SettingsPriceFeedBlockV1(props: {
  config: DaaSystemConfigV2;
  setConfig: SettingsConfigSetterV1;
}) {
  const { config, setConfig } = props;

  return (
    <SubsectionCardV1
      title="行情与缓存"
      description="决定行情来源、刷新频率，以及本地缓存多久算新鲜、多久还能兜底服务。"
    >
      <div style={settingsGridCols2StyleV1}>
        <CheckboxRowV1
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
        </CheckboxRowV1>

        <div>
          <FieldLabelV1>行情提供方</FieldLabelV1>
          <FormInputV1
            value={config.dataSources.priceFeed.provider}
            onChange={(e) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      dataSources: {
                        ...prev.dataSources,
                        priceFeed: {
                          ...prev.dataSources.priceFeed,
                          provider: e.target.value.trim() || "yfinance",
                        },
                      },
                    }
                  : prev,
              )
            }
          />
        </div>

        <div>
          <FieldLabelV1>行情刷新间隔（分钟）</FieldLabelV1>
          <NumberInputV1
            value={config.dataSources.priceFeed.intervalMinutes}
            min={1}
            max={240}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      dataSources: {
                        ...prev.dataSources,
                        priceFeed: {
                          ...prev.dataSources.priceFeed,
                          intervalMinutes: Math.max(1, Math.trunc(value || 1)),
                        },
                      },
                    }
                  : prev,
              )
            }
          />
        </div>

        <div>
          <FieldLabelV1>缓存新鲜阈值（分钟）</FieldLabelV1>
          <NumberInputV1
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
          <FieldLabelV1>陈旧缓存兜底窗口（小时）</FieldLabelV1>
          <NumberInputV1
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
          <FieldLabelV1>原始行情保留天数</FieldLabelV1>
          <NumberInputV1
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
    </SubsectionCardV1>
  );
}
