import type { DaaSystemConfigV2 } from "@/src/daa/config/systemConfigV2";

import {
  CheckboxRowV1,
  FieldLabelV1,
  NumberInputV1,
  SubsectionCardV1,
  settingsPresetButtonStyleV1,
  type SettingsConfigSetterV1,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitivesV1";

const weightGridStyleV1 = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(4, 1fr)",
  marginBottom: 12,
} as const;

export function SettingsNewsResearchBlockV1(props: {
  config: DaaSystemConfigV2;
  setConfig: SettingsConfigSetterV1;
}) {
  const { config, setConfig } = props;

  return (
    <SubsectionCardV1
      title="资讯融合"
      description="把新闻、人因、技术与估值四类输入合成建议分数，决定资讯层更偏解释、还是更偏决策。"
    >
      <div>
        <CheckboxRowV1
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
        </CheckboxRowV1>

        <div style={{ marginTop: 14 }}>
          <FieldLabelV1>信号融合权重（自动归一）</FieldLabelV1>
          <div style={weightGridStyleV1}>
            {([
              { key: "human", label: "人因" },
              { key: "news", label: "新闻" },
              { key: "technical", label: "技术" },
              { key: "valuation", label: "估值" },
            ] as const).map(({ key, label }) => (
              <div key={key}>
                <div style={{ fontSize: 11, color: "var(--faint)", marginBottom: 4 }}>{label}</div>
                <NumberInputV1
                  value={config.dataSources.newsFeed.fusionWeights[key]}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(value) =>
                    setConfig((prev) =>
                      prev
                        ? {
                            ...prev,
                            dataSources: {
                              ...prev.dataSources,
                              newsFeed: {
                                ...prev.dataSources.newsFeed,
                                fusionWeights: {
                                  ...prev.dataSources.newsFeed.fusionWeights,
                                  [key]: Math.max(0, value),
                                },
                              },
                            },
                          }
                        : prev,
                    )
                  }
                />
              </div>
            ))}
          </div>

          <CheckboxRowV1
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
            估值打分参与建议（关闭后仅展示估值信息，不参与最终动作）
          </CheckboxRowV1>

          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {[
              { label: "平衡", weights: { human: 0.35, news: 0.2, technical: 0.25, valuation: 0.2 } },
              { label: "技术优先", weights: { human: 0.2, news: 0.15, technical: 0.45, valuation: 0.2 } },
              { label: "价值优先", weights: { human: 0.2, news: 0.15, technical: 0.2, valuation: 0.45 } },
              { label: "人因优先", weights: { human: 0.55, news: 0.15, technical: 0.15, valuation: 0.15 } },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() =>
                  setConfig((prev) =>
                    prev
                      ? {
                          ...prev,
                          dataSources: {
                            ...prev.dataSources,
                            newsFeed: {
                              ...prev.dataSources.newsFeed,
                              fusionWeights: preset.weights,
                            },
                          },
                        }
                      : prev,
                  )
                }
                style={settingsPresetButtonStyleV1}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--primary)";
                  e.currentTarget.style.color = "var(--primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-strong)";
                  e.currentTarget.style.color = "var(--muted)";
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </SubsectionCardV1>
  );
}
