import { buildBrainConfigForMode, getBrainModeLabel } from "@/src/daa/brain/brainPolicy";
import {
  type DaaBrainMode,
  type DaaSystemConfig,
} from "@/src/daa/config/systemConfig";
import {
  CheckboxRow,
  FieldLabel,
  FormSelect,
  NumberInput,
  SectionCard,
  settingsGridCols2Style,
  type SettingsConfigSetter,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";

const MODE_OPTIONS: Array<{
  value: DaaBrainMode;
  title: string;
  description: string;
}> = [
  {
    value: "advisor",
    title: "顾问",
    description: "只读上下文 + 建议生成，不允许运行认知循环、模拟执行或配置写入。",
  },
  {
    value: "operator",
    title: "操作员",
    description: "允许手动运行认知循环、初始化论点和本地模拟执行，但不自动改系统配置。",
  },
  {
    value: "autopilot",
    title: "自动驾驶",
    description: "作为系统大脑运行：事件驱动分析，并在风控内按目标权重计划执行本地模拟调仓。",
  },
] as const;

export function SettingsBrainSection(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  const { config, setConfig } = props;
  const brain = config.brain ?? {
    mode: "autopilot" as const,
  };
  const agent = config.cognitiveAgent ?? {
    enabled: true,
    maxInvestigationTargets: 5,
    reviewIntervalDays: 14,
    memoryRecallLimit: 5,
    circuitBreakerThreshold: 3,
    schedule: "2x_daily" as const,
    scheduleTimesUtc: ["13:00", "21:00"],
    memoryDecayRate: 0.97,
    memoryArchiveThreshold: 0.05,
  };

  const updateBrain = (patch: Partial<NonNullable<DaaSystemConfig["brain"]>>) => {
    setConfig((prev) => prev ? {
      ...prev,
      brain: { ...brain, ...patch },
    } : prev);
  };

  const update = (patch: Partial<NonNullable<DaaSystemConfig["cognitiveAgent"]>>) => {
    setConfig((prev) => prev ? {
      ...prev,
      cognitiveAgent: { ...agent, ...patch },
    } : prev);
  };

  return (
    <section id="settings-brain" className="scroll-mt-28">
      <SectionCard
        title="大脑与自动化"
        description="把聊天助手、认知 Agent 和可自动落地的系统动作放到同一个授权面板里管理。这里决定 AI 到底只是顾问，还是系统大脑。"
      >
        <div className="space-y-4">
          <div>
            <div className="text-sm font-semibold text-[var(--text)]">授权等级</div>
            <div className="mt-1 text-xs leading-6 text-[var(--muted)]">
              当前模式：{getBrainModeLabel(brain.mode)}。自动驾驶会把 AI 作为系统大脑：自动分析、输出目标权重计划，并在风控内执行本地模拟调仓。
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {MODE_OPTIONS.map((item) => {
              const active = brain.mode === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => updateBrain(buildBrainConfigForMode(item.value, brain))}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    active
                      ? "border-[rgba(56,189,248,0.45)] bg-[rgba(56,189,248,0.10)]"
                      : "border-[var(--border)] bg-[rgba(255,255,255,0.02)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <div className="text-sm font-semibold text-[var(--text)]">{item.title}</div>
                  <div className="mt-2 text-xs leading-6 text-[var(--muted)]">{item.description}</div>
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-[rgba(125,211,252,0.18)] bg-[rgba(56,189,248,0.08)] p-4 text-xs leading-6 text-[var(--muted)]">
            当前执行边界仍然是本地模拟账本，不会触达真实券商；自动驾驶只能通过目标权重计划触发调仓，不会自动修改系统配置或风险护栏。
          </div>
        </div>

        <div className="mt-6 border-t border-[var(--border)] pt-6">
          <div className="mb-4">
            <div className="text-sm font-semibold text-[var(--text)]">认知引擎</div>
            <div className="mt-1 text-xs leading-6 text-[var(--muted)]">
              这部分控制大脑的调查频率、记忆深度和运行稳定性。Agent 触发调仓时只提交目标权重计划，再由统一风控决定是否生成和执行。
            </div>
          </div>

          <CheckboxRow
            checked={agent.enabled}
            onChange={(value) => update({ enabled: value })}
          >
            启用认知 Agent
          </CheckboxRow>

          <div style={{ ...settingsGridCols2Style, marginTop: 16 }}>
          {/* 调查参数 */}
            <div>
              <FieldLabel>每次调查论点数</FieldLabel>
              <NumberInput
                value={agent.maxInvestigationTargets}
                min={1}
                max={10}
                step={1}
                onChange={(v) => update({ maxInvestigationTargets: v })}
              />
            </div>

            <div>
              <FieldLabel>默认复盘间隔（天）</FieldLabel>
              <NumberInput
                value={agent.reviewIntervalDays}
                min={1}
                max={90}
                step={1}
                onChange={(v) => update({ reviewIntervalDays: v })}
              />
            </div>

          {/* 调度参数 */}
            <div>
              <FieldLabel>运行频率</FieldLabel>
              <FormSelect
                value={agent.schedule ?? "2x_daily"}
                onChange={(e) => update({ schedule: e.target.value as NonNullable<DaaSystemConfig["cognitiveAgent"]>["schedule"] })}
              >
                <option value="2x_daily">每日 2 次（开盘前 + 收盘后）</option>
                <option value="daily">每日 1 次（收盘后）</option>
                <option value="every_6h">每 6 小时</option>
                <option value="manual_only">仅手动</option>
              </FormSelect>
            </div>

            <div>
              <FieldLabel>记忆召回数量</FieldLabel>
              <NumberInput
                value={agent.memoryRecallLimit}
                min={1}
                max={20}
                step={1}
                onChange={(v) => update({ memoryRecallLimit: v })}
              />
            </div>

          {/* 记忆管理 */}
            <div>
              <FieldLabel>记忆衰减率 (per day)</FieldLabel>
              <NumberInput
                value={agent.memoryDecayRate ?? 0.97}
                min={0.5}
                max={1.0}
                step={0.01}
                onChange={(v) => update({ memoryDecayRate: v })}
              />
            </div>

            <div>
              <FieldLabel>熔断阈值（连续失败次数）</FieldLabel>
              <NumberInput
                value={agent.circuitBreakerThreshold}
                min={1}
                max={10}
                step={1}
                onChange={(v) => update({ circuitBreakerThreshold: v })}
              />
            </div>
          </div>

        </div>
      </SectionCard>
    </section>
  );
}
