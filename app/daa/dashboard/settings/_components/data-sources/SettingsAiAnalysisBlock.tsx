"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

import {
  CheckboxRow,
  FieldLabel,
  FormInput,
  FormSelect,
  SubsectionCard,
  settingsPresetButtonStyle,
  type SettingsConfigSetter,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";

/** 预设 provider 选项 */
const LLM_PROVIDERS = [
  { value: "deepseek", label: "DeepSeek", defaultModel: "deepseek-chat" },
  { value: "openai", label: "OpenAI / 代理", defaultModel: "gpt-5.4" },
  { value: "codex", label: "Codex (OpenAI)", defaultModel: "gpt-5.4" },
  { value: "claude", label: "Claude (Anthropic)", defaultModel: "claude-sonnet-4-20250514" },
  { value: "custom", label: "自定义" },
] as const;

const TASK_TYPES = [
  { value: "analysis", label: "分析解读" },
  { value: "decision", label: "决策执行" },
  { value: "research", label: "深度研究" },
] as const;

/** 单个模型配置的默认值 */
const DEFAULT_MODEL = {
  id: `llm_model_${Date.now()}`,
  label: "新模型",
  taskType: "analysis" as const,
  enabled: true,
  provider: "openai",
  model: "gpt-5.4",
  timeoutMs: 30000,
};

type LlmModelConfig = {
  id: string;
  label: string;
  taskType: "analysis" | "decision" | "research";
  enabled: boolean;
  provider: string;
  model: string;
  timeoutMs: number;
  endpoint?: string;
};

function getProviderDefaultModel(provider: string): string {
  const match = LLM_PROVIDERS.find((item) => item.value === provider);
  return match && "defaultModel" in match ? match.defaultModel : "gpt-5.4";
}

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

function setLlmModels(
  setConfig: SettingsConfigSetter,
  models: LlmModelConfig[],
) {
  setConfig((prev) =>
    prev
      ? {
          ...prev,
          dataSources: {
            ...prev.dataSources,
            llmModels: models,
          },
        }
      : prev,
  );
}

interface ModelEditorProps {
  model: LlmModelConfig;
  onChange: (updated: LlmModelConfig, idx: number) => void;
  onDelete: (idx: number) => void;
  idx: number;
}

function ModelEditor({ model, onChange, onDelete, idx }: ModelEditorProps) {
  const isCustom = !LLM_PROVIDERS.some((p) => p.value === model.provider && p.value !== "custom");
  const effectiveProvider = isCustom ? "custom" : model.provider;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[rgba(8,12,20,0.3)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <FormInput
          value={model.label}
          placeholder="模型名称"
          className="w-40 font-semibold"
          onChange={(e) => onChange({ ...model, label: e.target.value }, idx)}
        />
        <button
          type="button"
          onClick={() => onDelete(idx)}
          className="p-1.5 rounded-md hover:bg-[var(--danger-bg)] text-[var(--faint)] hover:text-[var(--danger)]"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>任务类型</FieldLabel>
          <FormSelect
            value={model.taskType}
            onChange={(e) => onChange({ ...model, taskType: e.target.value as "analysis" | "decision" | "research" }, idx)}
          >
            {TASK_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </FormSelect>
        </div>

        <div>
          <FieldLabel>Provider</FieldLabel>
          <FormSelect
            value={effectiveProvider}
            onChange={(e) => {
              const val = e.target.value;
              const preset = LLM_PROVIDERS.find((p) => p.value === val);
              if (preset && "defaultModel" in preset) {
                onChange({
                  ...model,
                  provider: preset.value,
                  model: preset.defaultModel,
                  endpoint: "",
                }, idx);
              } else {
                onChange({ ...model, provider: val }, idx);
              }
            }}
          >
            {LLM_PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </FormSelect>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>模型名称</FieldLabel>
          <FormInput
            value={model.model}
            placeholder="例: gpt-5.4, deepseek-chat, claude-sonnet-4-20250514"
            onChange={(e) => onChange({ ...model, model: e.target.value.trim() || getProviderDefaultModel(model.provider) }, idx)}
          />
        </div>
        <div>
          <FieldLabel>超时 (ms)</FieldLabel>
          <FormInput
            type="number"
            value={model.timeoutMs}
            min={5000}
            max={300000}
            step={5000}
            onChange={(e) => onChange({ ...model, timeoutMs: Number(e.target.value) || 15000 }, idx)}
          />
        </div>
      </div>

      <div>
        <FieldLabel>专用 Endpoint（可选）</FieldLabel>
        <FormInput
          value={model.endpoint ?? ""}
          placeholder={effectiveProvider === "custom" ? "https://your-api.example.com/v1" : "例: https://your-proxy.example.com/v1"}
          onChange={(e) => onChange({ ...model, endpoint: e.target.value.trim() || undefined }, idx)}
        />
        <div className="mt-2 text-xs leading-5 text-[var(--faint)]">
          留空则沿用「凭证与连接」中的全局配置；如果填写 base_url，系统会按 Responses / Chat 自动补全请求路径。
        </div>
      </div>

      <CheckboxRow
        checked={model.enabled}
        onChange={(value) => onChange({ ...model, enabled: value }, idx)}
      >
        启用此模型
      </CheckboxRow>
    </div>
  );
}

export function SettingsAiAnalysisBlock(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  const { config, setConfig } = props;
  const llm = config.dataSources.llmAnalysis;
  const models: LlmModelConfig[] = config.dataSources.llmModels ?? [];
  const [showLegacy, setShowLegacy] = useState(false);

  const isCustom = !LLM_PROVIDERS.some((p) => p.value === llm.provider && p.value !== "custom");
  const effectiveProvider = isCustom ? "custom" : llm.provider;

  const handleModelChange = (updated: LlmModelConfig, idx: number) => {
    const newModels = [...models];
    newModels[idx] = updated;
    setLlmModels(setConfig, newModels);
  };

  const handleModelDelete = (idx: number) => {
    const newModels = models.filter((_, i) => i !== idx);
    setLlmModels(setConfig, newModels);
  };

  return (
    <SubsectionCard
      title="AI 解读"
      description="配置多模型支持：分析解读、决策执行、深度研究可使用不同模型。"
    >
      {/* 兼容模式切换 */}
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowLegacy(false)}
          className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
            !showLegacy ? "bg-[var(--primary)] text-[var(--bg)]" : "bg-[var(--elevated)] text-[var(--muted)]"
          }`}
        >
          多模型配置
        </button>
        <button
          type="button"
          onClick={() => setShowLegacy(true)}
          className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
            showLegacy ? "bg-[var(--primary)] text-[var(--bg)]" : "bg-[var(--elevated)] text-[var(--muted)]"
          }`}
        >
          简单模式
        </button>
      </div>

      {!showLegacy ? (
        /* 多模型配置模式 */
        <div className="space-y-4">
          {models.length === 0 ? (
            <div className="text-sm text-[var(--muted)] py-4">
              暂未配置模型，请添加。
            </div>
          ) : (
            models.map((model, idx) => (
              <ModelEditor
                key={model.id}
                model={model}
                idx={idx}
                onChange={handleModelChange}
                onDelete={handleModelDelete}
              />
            ))
          )}

          <button
            type="button"
            onClick={() => {
              const newModels = [...models, { ...DEFAULT_MODEL, id: `llm_model_${Date.now()}` }];
              setLlmModels(setConfig, newModels);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-[var(--border)] text-[var(--muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
          >
            <Plus className="h-4 w-4" />
            添加模型
          </button>

          {/* 预设模板 */}
          {models.length > 0 && (
            <div className="pt-2">
              <div className="text-xs text-[var(--faint)] mb-2">快速添加</div>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const newModels = [
                      ...models,
                      { ...DEFAULT_MODEL, id: `llm_model_${Date.now()}_fast`, label: "快速模型", taskType: "analysis" as const, provider: "openai", model: "gpt-5.4", timeoutMs: 20000 },
                    ];
                    setLlmModels(setConfig, newModels);
                  }}
                  style={settingsPresetButtonStyle}
                >
                  + GPT-5.4 分析模型
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const newModels = [
                      ...models,
                      { ...DEFAULT_MODEL, id: `llm_model_${Date.now()}_reasoner`, label: "研究模型", taskType: "research" as const, provider: "openai", model: "gpt-5.4", timeoutMs: 60000 },
                    ];
                    setLlmModels(setConfig, newModels);
                  }}
                  style={settingsPresetButtonStyle}
                >
                  + GPT-5.4 研究模型
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* 简单模式（向后兼容） */
        <div>
          <CheckboxRow
            checked={llm.enabled}
            onChange={(value) => setLlmField(setConfig, { enabled: value })}
          >
            启用 AI 解读
          </CheckboxRow>

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
                    endpoint: "",
                  });
                } else {
                  setLlmField(setConfig, { provider: val });
                }
              }}
            >
              {LLM_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </FormSelect>
          </div>

          <div style={{ marginTop: 14 }}>
            <FieldLabel>模型名称</FieldLabel>
            <FormInput
              value={llm.model}
              placeholder="例: gpt-5.4, deepseek-chat, claude-sonnet-4-20250514"
              onChange={(e) => setLlmField(setConfig, { model: e.target.value.trim() || getProviderDefaultModel(llm.provider) })}
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <FieldLabel>专用 Endpoint（可选）</FieldLabel>
            <FormInput
              value={llm.endpoint ?? ""}
              placeholder={effectiveProvider === "custom" ? "https://your-api.example.com/v1" : "例: https://your-proxy.example.com/v1"}
              onChange={(e) => setLlmField(setConfig, { endpoint: e.target.value.trim() || undefined })}
            />
          </div>

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
            💡 API Key 在「凭证」页管理。支持 per-provider 独立 Key（如 DAA_DEEPSEEK_API_KEY、DAA_OPENAI_API_KEY、DAA_ANTHROPIC_API_KEY），也支持通用 DAA_LLM_API_KEY。Endpoint 可直接填写 base_url，系统会自动按 Responses / Chat 补全请求路径。
          </div>
        </div>
      )}
    </SubsectionCard>
  );
}
