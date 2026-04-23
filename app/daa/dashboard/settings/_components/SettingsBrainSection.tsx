import { buildBrainConfigForMode, getBrainModeLabel } from "@/src/daa/brain/brainPolicy";
import {
  DEFAULT_BRAIN_CONFIG_PATCH_WHITELIST_,
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
    description: "允许手动运行认知循环、初始化论点、模拟执行；配置 patch 仅建议，不自动落地。",
  },
  {
    value: "autopilot",
    title: "自动驾驶",
    description: "在保留高风险确认门禁的前提下，允许大脑对白名单低风险 patch 自动落地。",
  },
] as const;

const CONFIG_PATCH_OPTIONS: Array<{ path: string; label: string; hint: string }> = [
  { path: "/cognitiveAgent/schedule", label: "认知循环频率", hint: "允许 AI 调整日更 / 双更 / 仅手动节奏。" },
  { path: "/cognitiveAgent/maxInvestigationTargets", label: "单次调查论点数", hint: "允许 AI 调整每轮调查深度。" },
  { path: "/cognitiveAgent/reviewIntervalDays", label: "论点复盘间隔", hint: "允许 AI 调整 thesis 复盘节奏。" },
  { path: "/cognitiveAgent/agentTriggerEnabled", label: "主动触发再平衡", hint: "允许 AI 打开或关闭事件驱动再平衡触发。" },
  { path: "/rebalanceStrategy/analysisFocus", label: "分析重点", hint: "允许 AI 修改当前分析主线和关注语境。" },
  { path: "/dataSources/llmModels", label: "多模型路由", hint: "允许 AI 在白名单内调整分析 / 决策 / 研究模型路由。" },
] as const;

export function SettingsBrainSection(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  const { config, setConfig } = props;
  const brain = config.brain ?? {
    mode: "operator" as const,
    allowConfigPatch: true,
    autoApplyLowRiskPatch: false,
    configPatchWhitelist: [...DEFAULT_BRAIN_CONFIG_PATCH_WHITELIST_],
  };
  const agent = config.cognitiveAgent ?? {
    enabled: true,
    maxInvestigationTargets: 3,
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

  const toggleWhitelistPath = (path: string, checked: boolean) => {
    const current = new Set(brain.configPatchWhitelist ?? []);
    if (checked) current.add(path);
    else current.delete(path);
    updateBrain({ configPatchWhitelist: Array.from(current) });
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
              当前模式：{getBrainModeLabel(brain.mode)}。建议默认使用「操作员」，等白名单和复盘链路更稳定后再切到「自动驾驶」。
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
            真正的“全权大脑”不是去掉所有门禁，而是让 AI 统一看见上下文、统一做规划，再按照授权等级执行动作并回写复盘。
          </div>
        </div>

        <div className="mt-6 border-t border-[var(--border)] pt-6">
          <div className="mb-4">
            <div className="text-sm font-semibold text-[var(--text)]">认知引擎</div>
            <div className="mt-1 text-xs leading-6 text-[var(--muted)]">
              这部分控制大脑的调查频率、记忆深度和是否允许由 Agent 主动触发策略动作。
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

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <CheckboxRow
              checked={agent.agentOverlayEnabled ?? false}
              onChange={(value) => update({ agentOverlayEnabled: value })}
            >
              允许 Agent 生成规则参数建议
            </CheckboxRow>
            <CheckboxRow
              checked={agent.agentTriggerEnabled ?? false}
              onChange={(value) => update({ agentTriggerEnabled: value })}
              disabled={brain.mode === "advisor"}
            >
              允许 Agent 主动触发再平衡
            </CheckboxRow>
          </div>
        </div>

        <div className="mt-6 border-t border-[var(--border)] pt-6">
          <div className="mb-4">
            <div className="text-sm font-semibold text-[var(--text)]">配置落地策略</div>
            <div className="mt-1 text-xs leading-6 text-[var(--muted)]">
              建议只对白名单低风险字段开放配置 patch。这样 AI 可以帮我们调优，但不会直接把系统改乱。
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <CheckboxRow
              checked={brain.allowConfigPatch}
              onChange={(value) => updateBrain({
                allowConfigPatch: value,
                autoApplyLowRiskPatch: value ? brain.autoApplyLowRiskPatch : false,
              })}
              disabled={brain.mode === "advisor"}
            >
              允许大脑生成配置 patch 建议
            </CheckboxRow>
            <CheckboxRow
              checked={brain.autoApplyLowRiskPatch}
              onChange={(value) => updateBrain({ autoApplyLowRiskPatch: value })}
              disabled={brain.mode !== "autopilot" || !brain.allowConfigPatch}
            >
              自动落地白名单低风险 patch（仅自动驾驶）
            </CheckboxRow>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {CONFIG_PATCH_OPTIONS.map((item) => (
              <div key={item.path} className="rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-4">
                <CheckboxRow
                  checked={brain.configPatchWhitelist.includes(item.path)}
                  onChange={(checked) => toggleWhitelistPath(item.path, checked)}
                  disabled={!brain.allowConfigPatch || brain.mode === "advisor"}
                >
                  {item.label}
                </CheckboxRow>
                <div className="mt-2 text-xs leading-6 text-[var(--muted)]">{item.hint}</div>
                <div className="mt-1 text-[11px] leading-5 text-[var(--faint)]">{item.path}</div>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>
    </section>
  );
}
