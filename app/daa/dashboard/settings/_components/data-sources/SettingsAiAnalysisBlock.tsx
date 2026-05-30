"use client";

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

const TASK_TYPE_LABELS = Object.fromEntries(TASK_TYPES.map((item) => [item.value, item.label])) as Record<LlmModelConfig["taskType"], string>;

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
  const providerLabel = LLM_PROVIDERS.find((item) => item.value === effectiveProvider)?.label || model.provider;

  return (
    <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 md:p-5">
      <div className="flex flex-col gap-3 border-b border-[var(--elevated)] pb-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-[var(--primary)] bg-[var(--primary-bg)] px-2.5 py-1 text-[var(--primary)]">
              {TASK_TYPE_LABELS[model.taskType]}
            </span>
            <span className="rounded-full border border-[var(--hover)] bg-[var(--elevated)] px-2.5 py-1 text-[var(--muted)]">
              {providerLabel}
            </span>
            <span className={`rounded-full border px-2.5 py-1 ${model.enabled ? "border-[var(--success)] bg-[var(--success)] text-[var(--success)]" : "border-[rgba(148,163,184,0.18)] bg-[rgba(148,163,184,0.08)] text-[var(--faint)]"}`}>
              {model.enabled ? "已启用" : "已停用"}
            </span>
          </div>
          <div className="text-xs leading-6 text-[var(--muted)]">
            模型名称和 Endpoint 较长时会自动独占一行，便于检查路由是否正确。
          </div>
        </div>
        <button
          type="button"
          onClick={() => onDelete(idx)}
          className="self-start rounded-md p-1.5 text-[var(--faint)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
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
            onChange={(e) => onChange({ ...model, label: e.target.value }, idx)}
          />
        </div>

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

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
        <div>
          <FieldLabel>模型名称</FieldLabel>
          <FormInput
            value={model.model}
            placeholder="例: gpt-5.4, claude-sonnet-4-20250514, deepseek-chat"
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

      <div className="space-y-2">
        <FieldLabel>专用 Endpoint（可选，单独占行）</FieldLabel>
        <FormInput
          value={model.endpoint ?? ""}
          placeholder={effectiveProvider === "custom" ? "https://your-api.example.com/v1" : "例: https://your-proxy.example.com/v1"}
          onChange={(e) => onChange({ ...model, endpoint: e.target.value.trim() || undefined }, idx)}
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--elevated)] pt-3 lg:flex-row lg:items-center lg:justify-between">
        <CheckboxRow
          checked={model.enabled}
          onChange={(value) => onChange({ ...model, enabled: value }, idx)}
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

export function SettingsAiAnalysisBlock(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  const { config, setConfig } = props;
  const models: LlmModelConfig[] = config.dataSources.llmModels;

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
    <SubsectionCard title="AI 解读">
      <div className="mb-4 rounded-xl border border-[var(--primary)] bg-[var(--primary-bg)] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-[var(--text)]">多模型路由</div>
            <div className="mt-1 max-w-3xl text-xs leading-6 text-[var(--muted)]">
              这里更适合做“按任务分工”的配置：分析解读、决策执行、深度研究可以分别指定模型；内容较长的模型名与 Endpoint 已改成独立行展示，检查起来更直观。
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {TASK_TYPES.map((item) => (
              <span
                key={item.value}
                className="rounded-full border border-[var(--hover)] bg-[var(--elevated)] px-2.5 py-1 text-[var(--muted)]"
              >
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {models.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-5 text-sm text-[var(--muted)]">
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
    </SubsectionCard>
  );
}
