import type { DaaSystemConfigV2 } from "@/src/daa/config/systemConfigV2";

import {
  CheckboxRowV1,
  FieldLabelV1,
  FormInputV1,
  SubsectionCardV1,
  type SettingsConfigSetterV1,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitivesV1";

export function SettingsAiAnalysisBlockV1(props: {
  config: DaaSystemConfigV2;
  setConfig: SettingsConfigSetterV1;
}) {
  const { config, setConfig } = props;

  return (
    <SubsectionCardV1
      title="AI 解读"
      description="控制研究文案与解释层使用的模型，不改变策略核心打分，只影响输出说明与辅助判断。"
    >
      <div>
        <CheckboxRowV1
          checked={config.dataSources.llmAnalysis.enabled}
          onChange={(value) =>
            setConfig((prev) =>
              prev
                ? {
                    ...prev,
                    dataSources: {
                      ...prev.dataSources,
                      llmAnalysis: { ...prev.dataSources.llmAnalysis, enabled: value },
                    },
                  }
                : prev,
            )
          }
        >
          启用 AI 解读
        </CheckboxRowV1>

        <div style={{ marginTop: 14 }}>
          <FieldLabelV1>AI 分析模型</FieldLabelV1>
          <FormInputV1
            value={config.dataSources.llmAnalysis.model}
            onChange={(e) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      dataSources: {
                        ...prev.dataSources,
                        llmAnalysis: {
                          ...prev.dataSources.llmAnalysis,
                          model: e.target.value.trim() || "gpt-5-codex",
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
