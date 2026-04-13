import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

import {
  CheckboxRow,
  FieldLabel,
  FormInput,
  FormSelect,
  SubsectionCard,
  type SettingsConfigSetter,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";

/** 预设 provider 选项 */
const LLM_PROVIDERS = [
  { value: "deepseek", label: "DeepSeek", defaultModel: "deepseek-chat" },
  { value: "openai", label: "OpenAI", defaultModel: "gpt-4o-mini" },
  { value: "codex", label: "Codex (OpenAI)", defaultModel: "o3-mini" },
  { value: "claude", label: "Claude (Anthropic)", defaultModel: "claude-sonnet-4-20250514" },
  { value: "custom", label: "自定义" },
] as const;

function setLlmField(
  setConfig: SettingsConfigSetter,
  patch: Partial<DaaSystemConfig["dataSources"]["llmAnalysis"]>,
) {
  setConfig((prev) =>
    prev
      ? {
          ...prev,
          dataSources: {
            ...prev.dataSources,
            llmAnalysis: { ...prev.dataSources.llmAnalysis, ...patch },
          },
        }
      : prev,
  );
}

export function SettingsAiAnalysisBlock(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  const { config, setConfig } = props;
  const llm = config.dataSources.llmAnalysis;
  const isCustom = !LLM_PROVIDERS.some((p) => p.value === llm.provider && p.value !== "custom");
  const effectiveProvider = isCustom ? "custom" : llm.provider;

  return (
    <SubsectionCard
      title="AI 解读"
      description="控制研究文案与解释层使用的模型，不改变策略核心打分，只影响输出说明与辅助判断。"
    >
      <div>
        <CheckboxRow
          checked={llm.enabled}
          onChange={(value) => setLlmField(setConfig, { enabled: value })}
        >
          启用 AI 解读
        </CheckboxRow>

        {/* Provider 选择 */}
        <div style={{ marginTop: 14 }}>
          <FieldLabel>LLM Provider</FieldLabel>
          <FormSelect
            value={effectiveProvider}
            onChange={(e) => {
              const val = e.target.value;
              const preset = LLM_PROVIDERS.find((p) => p.value === val);
              if (preset && "defaultModel" in preset) {
                setLlmField(setConfig, {
                  provider: preset.value,
                  model: preset.defaultModel,
                  endpoint: "", // 清除自定义 endpoint，使用 provider 默认值
                });
              } else {
                setLlmField(setConfig, { provider: val });
              }
            }}
          >
            {LLM_PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </FormSelect>
        </div>

        {/* Model */}
        <div style={{ marginTop: 14 }}>
          <FieldLabel>模型名称</FieldLabel>
          <FormInput
            value={llm.model}
            placeholder="例: deepseek-chat, gpt-4o, o3-mini"
            onChange={(e) =>
              setLlmField(setConfig, { model: e.target.value.trim() || "deepseek-chat" })
            }
          />
        </div>

        {/* 自定义 Endpoint（仅 custom provider 显示） */}
        {effectiveProvider === "custom" && (
          <div style={{ marginTop: 14 }}>
            <FieldLabel>自定义 Endpoint</FieldLabel>
            <FormInput
              value={llm.endpoint ?? ""}
              placeholder="https://your-api.example.com/v1/chat/completions"
              onChange={(e) =>
                setLlmField(setConfig, { endpoint: e.target.value.trim() || undefined })
              }
            />
            <p style={{ fontSize: 12, color: "var(--color-text-secondary, #888)", marginTop: 4 }}>
              支持 OpenAI 兼容 API (/chat/completions) 和 Anthropic Messages API (/messages)
            </p>
          </div>
        )}

        {/* API Key 提示 */}
        <div
          style={{
            marginTop: 14,
            padding: "8px 12px",
            borderRadius: 6,
            background: "var(--color-bg-tertiary, #f5f5f5)",
            fontSize: 13,
            color: "var(--color-text-secondary, #666)",
          }}
        >
          💡 API Key 在「凭证」页管理。支持 per-provider 独立 Key（如 DAA_DEEPSEEK_API_KEY、DAA_OPENAI_API_KEY、DAA_ANTHROPIC_API_KEY），也支持通用 DAA_LLM_API_KEY。
        </div>
      </div>
    </SubsectionCard>
  );
}
