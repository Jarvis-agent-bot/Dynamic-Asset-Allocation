import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import {
  CheckboxRow,
  FieldLabel,
  FormSelect,
  NumberInput,
  SectionCard,
  settingsGridCols2Style,
  type SettingsConfigSetter,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";

export function SettingsAgentSection(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  const { config, setConfig } = props;
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

  const update = (patch: Partial<NonNullable<DaaSystemConfig["cognitiveAgent"]>>) => {
    setConfig((prev) => prev ? {
      ...prev,
      cognitiveAgent: { ...agent, ...patch },
    } : prev);
  };

  return (
    <section id="settings-agent" className="scroll-mt-28">
      <SectionCard
        title="认知 Agent"
        description="Cognitive Agent OS 参数：控制调查频率、复盘周期、记忆管理等。"
      >
        <CheckboxRow
          checked={agent.enabled}
          onChange={(value) => update({ enabled: value })}
        >
          启用认知 Agent
        </CheckboxRow>

        <div style={settingsGridCols2Style}>
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
              <option value="2x_daily">每日 2 次（开盘前+收盘后）</option>
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
      </SectionCard>
    </section>
  );
}
