"use client";

import { Plus, Trash2 } from "lucide-react";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

import {
  CheckboxRow,
  FieldLabel,
  FormInput,
  FormSelect,
  SubsectionCard,
  settingsPresetButtonClassName,
  type SettingsConfigSetter,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";

const LLM_PROVIDERS = [
  { value: "deepseek", label: "DeepSeek", defaultModel: "deepseek-chat" },
  { value: "openai", label: "OpenAI / 转发", defaultModel: "gpt-5.4" },
  { value: "codex", label: "Codex (OpenAI)", defaultModel: "gpt-5.4" },
  { value: "claude", label: "Claude (Anthropic)", defaultModel: "claude-sonnet-4-20250514" },
  { value: "custom", label: "自定义" },
] as const;

const TASK_TYPES = [
  { value: "analysis", label: "分析解读" },
  { value: "decision", label: "决策执行" },
  { value: "research", label: "深度研究" },
] as const;

const TASK_TYPE_LABELS = Object.fromEntries(TASK_TYPES.map((item) => [item.value, item.label])) as Record<LlmModelConfig["taskType"], string>;

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

interface ModelRoutingEditorProps {
  model: LlmModelConfig;
  onChange: (updated: LlmModelConfig, modelIndex: number) => void;
  onDelete: (modelIndex: number) => void;
  modelIndex: number;
}

function ModelRoutingEditor({ model, onChange, onDelete, modelIndex }: ModelRoutingEditorProps) {
  const isCustom = !LLM_PROVIDERS.some((providerOption) => providerOption.value === model.provider && providerOption.value !== "custom");
  const effectiveProvider = isCustom ? "custom" : model.provider;
  const providerLabel = LLM_PROVIDERS.find((item) => item.value === effectiveProvider)?.label || model.provider;

  return (
    <div className="space-y-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3.5 md:p-4">
      <div className="flex flex-col gap-3 border-b border-[var(--elevated)] pb-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-[var(--radius-sm)] border border-[var(--primary)] bg-[var(--primary-bg)] px-2.5 py-1 text-[var(--primary)]">
              {TASK_TYPE_LABELS[model.taskType]}
            </span>
            <span className="rounded-[var(--radius-sm)] border border-[var(--hover)] bg-[var(--elevated)] px-2.5 py-1 text-[var(--muted)]">
              {providerLabel}
            </span>
            <span className={`rounded-[var(--radius-sm)] border px-2.5 py-1 ${model.enabled ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]" : "border-[var(--border)] bg-[var(--elevated)] text-[var(--faint)]"}`}>
              {model.enabled ? "已启用" : "已停用"}
            </span>
          </div>
          <div className="text-xs leading-6 text-[var(--muted)]">
            模型名称和 Endpoint 较长时会自动独占一行，便于检查任务路由是否正确。
          </div>
        </div>
        <button
          type="button"
          onClick={() => onDelete(modelIndex)}
          className="self-start rounded-[var(--radius-sm)] p-1.5 text-[var(--faint)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_200px_220px]">
        <div>
          <FieldLabel>显示名称</FieldLabel>
          <FormInput
            value={model.label}
            placeholder="例：分析模型 / 决策模型 / 研究模型"
            onChange={(event) => onChange({ ...model, label: event.target.value }, modelIndex)}
          />
        </div>

        <div>
          <FieldLabel>任务类型</FieldLabel>
          <FormSelect
            value={model.taskType}
            onChange={(event) => onChange({ ...model, taskType: event.target.value as "analysis" | "decision" | "research" }, modelIndex)}
          >
            {TASK_TYPES.map((taskType) => (
              <option key={taskType.value} value={taskType.value}>{taskType.label}</option>
            ))}
          </FormSelect>
        </div>

        <div>
          <FieldLabel>Provider</FieldLabel>
          <FormSelect
            value={effectiveProvider}
            onChange={(event) => {
              const providerValue = event.target.value;
              const preset = LLM_PROVIDERS.find((providerOption) => providerOption.value === providerValue);
              if (preset && "defaultModel" in preset) {
                onChange({
                  ...model,
                  provider: preset.value,
                  model: preset.defaultModel,
                  endpoint: "",
                }, modelIndex);
              } else {
                onChange({ ...model, provider: providerValue }, modelIndex);
              }
            }}
          >
            {LLM_PROVIDERS.map((providerOption) => (
              <option key={providerOption.value} value={providerOption.value}>{providerOption.label}</option>
            ))}
          </FormSelect>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
        <div>
          <FieldLabel>模型名称</FieldLabel>
          <FormInput
            value={model.model}
            placeholder="例: gpt-5.4, claude-sonnet-4-20250514, deepseek-chat"
            onChange={(event) => onChange({ ...model, model: event.target.value.trim() || getProviderDefaultModel(model.provider) }, modelIndex)}
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
            onChange={(event) => onChange({ ...model, timeoutMs: Number(event.target.value) || 15000 }, modelIndex)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <FieldLabel>专用 Endpoint（可选，单独占行）</FieldLabel>
        <FormInput
          value={model.endpoint ?? ""}
          placeholder={effectiveProvider === "custom" ? "https://your-api.example.com/v1" : "例: https://your-proxy.example.com/v1"}
          onChange={(event) => onChange({ ...model, endpoint: event.target.value.trim() || undefined }, modelIndex)}
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--elevated)] pt-3 lg:flex-row lg:items-center lg:justify-between">
        <CheckboxRow
          checked={model.enabled}
          onChange={(value) => onChange({ ...model, enabled: value }, modelIndex)}
        >
          启用此模型
        </CheckboxRow>
        <div className="max-w-2xl text-xs leading-6 text-[var(--faint)]">
          留空则沿用「凭证与连接」中的全局配置；如果填写的是 base_url，系统会按 Responses / Chat 自动补全请求路径。
        </div>
      </div>
    </div>
  );
}

export function SettingsModelRoutingBlock(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  const { config, setConfig } = props;
  const models: LlmModelConfig[] = config.dataSources.llmModels;

  const handleModelChange = (updated: LlmModelConfig, modelIndex: number) => {
    const updatedModels = [...models];
    updatedModels[modelIndex] = updated;
    setLlmModels(setConfig, updatedModels);
  };

  const handleModelDelete = (modelIndexToDelete: number) => {
    const updatedModels = models.filter((_, modelIndex) => modelIndex !== modelIndexToDelete);
    setLlmModels(setConfig, updatedModels);
  };

  return (
    <SubsectionCard title="模型路由">
      <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--primary-border)] bg-[var(--primary-bg)] p-3.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-[var(--text)]">按任务分配模型</div>
            <div className="mt-1 max-w-3xl text-xs leading-5 text-[var(--muted)]">
              分析解读、决策执行、深度研究分别指定模型；长模型名与 Endpoint 独立展示。
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {TASK_TYPES.map((item) => (
              <span
                key={item.value}
                className="rounded-[var(--radius-sm)] border border-[var(--hover)] bg-[var(--elevated)] px-2.5 py-1 text-[var(--muted)]"
              >
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {models.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-5 text-sm text-[var(--muted)]">
            暂未配置模型，请添加。
          </div>
        ) : (
          models.map((model, modelIndex) => (
            <ModelRoutingEditor
              key={model.id}
              model={model}
              modelIndex={modelIndex}
              onChange={handleModelChange}
              onDelete={handleModelDelete}
            />
          ))
        )}

        <button
          type="button"
          onClick={() => {
            const updatedModels = [...models, { ...DEFAULT_MODEL, id: `llm_model_${Date.now()}` }];
            setLlmModels(setConfig, updatedModels);
          }}
          className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-4 py-2 text-[var(--muted)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
        >
          <Plus className="h-4 w-4" />
          添加模型
        </button>

        {models.length > 0 && (
          <div className="pt-2">
            <div className="text-xs text-[var(--faint)] mb-2">快速添加</div>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  const updatedModels = [
                    ...models,
                    { ...DEFAULT_MODEL, id: `llm_model_${Date.now()}_fast`, label: "快速模型", taskType: "analysis" as const, provider: "openai", model: "gpt-5.4", timeoutMs: 20000 },
                  ];
                  setLlmModels(setConfig, updatedModels);
                }}
                className={settingsPresetButtonClassName}
              >
                + GPT-5.4 分析模型
              </button>
              <button
                type="button"
                onClick={() => {
                  const updatedModels = [
                    ...models,
                    { ...DEFAULT_MODEL, id: `llm_model_${Date.now()}_reasoner`, label: "研究模型", taskType: "research" as const, provider: "openai", model: "gpt-5.4", timeoutMs: 60000 },
                  ];
                  setLlmModels(setConfig, updatedModels);
                }}
                className={settingsPresetButtonClassName}
              >
                + GPT-5.4 研究模型
              </button>
            </div>
          </div>
        )}
      </div>
    </SubsectionCard>
  );
}
