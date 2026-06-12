import { buildBrainConfigForMode, getBrainModeLabel } from "@/src/daa/brain/brainPolicy";
import {
  type DaaBrainMode,
  type DaaCognitiveAgentSchedule as ReviewAutomationSchedule,
  type DaaSystemConfig,
} from "@/src/daa/config/systemConfig";
import {
  CheckboxRow,
  FieldLabel,
  FormSelect,
  NumberInput,
  SectionCard,
  type SettingsConfigSetter,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";

const MODE_OPTIONS: Array<{
  value: DaaBrainMode;
  title: string;
  description: string;
}> = [
  {
    value: "advisor",
    title: "仅建议",
    description: "只读组合上下文并生成建议，不允许运行复核、模拟执行或配置写入。",
  },
  {
    value: "operator",
    title: "手动复核",
    description: "允许手动运行复核、建立初始投资判断和本地模拟执行，但不自动改系统配置。",
  },
  {
    value: "autopilot",
    title: "自动复核",
    description: "按事件驱动复核组合，并在风控内按目标权重计划执行本地模拟调仓。",
  },
] as const;

export function SettingsAssistantAutomationSection(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  const { config, setConfig } = props;
  const assistantAuthorityConfig = config.brain ?? {
    mode: "autopilot" as const,
  };
  const reviewAutomationConfig = config.cognitiveAgent ?? {
    enabled: true,
    maxInvestigationTargets: 5,
    reviewIntervalDays: 14,
    memoryRecallLimit: 5,
    circuitBreakerThreshold: 3,
    schedule: "daily" as const,
    memoryDecayRate: 0.97,
  };

  const updateAssistantAuthorityConfig = (patch: Partial<NonNullable<DaaSystemConfig["brain"]>>) => {
    setConfig((prev) => prev ? {
      ...prev,
      brain: { ...assistantAuthorityConfig, ...patch },
    } : prev);
  };

  const updateReviewAutomationConfig = (patch: Partial<NonNullable<DaaSystemConfig["cognitiveAgent"]>>) => {
    setConfig((prev) => prev ? {
      ...prev,
      cognitiveAgent: { ...reviewAutomationConfig, ...patch },
    } : prev);
  };

  return (
    <SectionCard title="投资助理与自动化">
      <div className="space-y-4">
        <div>
          <div className="text-sm font-semibold text-[var(--text)]">授权等级</div>
          <div className="mt-1 text-xs leading-6 text-[var(--muted)]">
            当前：{getBrainModeLabel(assistantAuthorityConfig.mode)}。控制复核、目标权重计划和本地模拟执行权限。
          </div>
        </div>

        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
          {MODE_OPTIONS.map((item) => {
            const active = assistantAuthorityConfig.mode === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => updateAssistantAuthorityConfig(buildBrainConfigForMode(item.value, assistantAuthorityConfig))}
                className={`grid w-full gap-3 border-b border-[var(--border)] px-4 py-3 text-left transition-colors last:border-b-0 md:grid-cols-[minmax(120px,0.42fr)_1fr_auto] md:items-center ${
                  active
                    ? "bg-[var(--primary-bg)]"
                    : "bg-[var(--card)] hover:bg-[var(--elevated)]/40"
                }`}
              >
                <div className="text-sm font-semibold text-[var(--text)]">{item.title}</div>
                <div className="text-xs leading-6 text-[var(--muted)]">{item.description}</div>
                <span className={`inline-flex w-fit items-center rounded-[var(--radius-sm)] border px-2 py-1 text-[11px] font-medium ${
                  active
                    ? "border-[var(--primary-border)] text-[var(--primary)]"
                    : "border-[var(--border)] text-[var(--faint)]"
                }`}>
                  {active ? "当前" : "可切换"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="rounded-[var(--radius-md)] border border-[var(--primary-border)] bg-[var(--primary-bg)] px-4 py-3 text-xs leading-5 text-[var(--muted)]">
          执行边界：仅本地模拟账本；真实券商、系统配置和风险护栏不会被自动改写。
        </div>
      </div>

      <div className="mt-5 border-t border-[var(--border)] pt-5">
        <div className="mb-4">
          <div className="text-sm font-semibold text-[var(--text)]">复核引擎</div>
          <div className="mt-1 text-xs leading-6 text-[var(--muted)]">
            控制复核频率、经验调用深度和失败熔断；调仓仍交给统一风控。
          </div>
        </div>

        <CheckboxRow
          checked={reviewAutomationConfig.enabled}
          onChange={(value) => updateReviewAutomationConfig({ enabled: value })}
        >
          启用投资助理复核
        </CheckboxRow>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <FieldLabel>每次复核判断数</FieldLabel>
            <NumberInput
              value={reviewAutomationConfig.maxInvestigationTargets}
              min={1}
              max={10}
              step={1}
              onChange={(value) => updateReviewAutomationConfig({ maxInvestigationTargets: value })}
            />
          </div>

          <div>
            <FieldLabel>默认复盘间隔（天）</FieldLabel>
            <NumberInput
              value={reviewAutomationConfig.reviewIntervalDays}
              min={1}
              max={90}
              step={1}
              onChange={(value) => updateReviewAutomationConfig({ reviewIntervalDays: value })}
            />
          </div>

          <div>
            <FieldLabel>运行频率</FieldLabel>
            <FormSelect
              value={reviewAutomationConfig.schedule ?? "daily"}
              onChange={(event) => updateReviewAutomationConfig({ schedule: event.target.value as ReviewAutomationSchedule })}
            >
              <option value="2x_daily">每日 2 次（开盘前 + 收盘后）</option>
              <option value="daily">每日 1 次（收盘后）</option>
              <option value="every_6h">每 6 小时</option>
              <option value="manual_only">仅手动</option>
            </FormSelect>
          </div>

          <div>
            <FieldLabel>经验记录调用数</FieldLabel>
            <NumberInput
              value={reviewAutomationConfig.memoryRecallLimit}
              min={1}
              max={20}
              step={1}
              onChange={(value) => updateReviewAutomationConfig({ memoryRecallLimit: value })}
            />
          </div>

          <div>
            <FieldLabel>经验衰减率（每日）</FieldLabel>
            <NumberInput
              value={reviewAutomationConfig.memoryDecayRate ?? 0.97}
              min={0.5}
              max={1.0}
              step={0.01}
              onChange={(value) => updateReviewAutomationConfig({ memoryDecayRate: value })}
            />
          </div>

          <div>
            <FieldLabel>熔断阈值（连续失败次数）</FieldLabel>
            <NumberInput
              value={reviewAutomationConfig.circuitBreakerThreshold}
              min={1}
              max={10}
              step={1}
              onChange={(value) => updateReviewAutomationConfig({ circuitBreakerThreshold: value })}
            />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
