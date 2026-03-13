import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

import {
  CheckboxRow,
  FieldLabel,
  FormInput,
  SubsectionCard,
  type SettingsConfigSetter,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";

export function SettingsAiAnalysisBlock(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  const { config, setConfig } = props;

  return (
    <SubsectionCard
      title="AI 解读"
      description="控制研究文案与解释层使用的模型，不改变策略核心打分，只影响输出说明与辅助判断。"
    >
      <div>
        <CheckboxRow
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
        </CheckboxRow>

        <div style={{ marginTop: 14 }}>
          <FieldLabel>AI 分析模型</FieldLabel>
          <FormInput
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
    </SubsectionCard>
  );
}
