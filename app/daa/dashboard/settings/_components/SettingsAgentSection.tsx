import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import {
  CheckboxRow,
  FieldLabel,
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
        description="Cognitive Agent OS 参数：控制每次调查的论点数量、复盘周期、记忆召回数量等。"
      >
        <CheckboxRow
          checked={agent.enabled}
          onChange={(value) => update({ enabled: value })}
        >
          启用认知 Agent
        </CheckboxRow>

        <div style={settingsGridCols2Style}>
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
