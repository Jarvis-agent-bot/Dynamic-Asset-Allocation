import { SettingsAssistantAutomationSection } from "@/app/daa/dashboard/settings/_components/SettingsAssistantAutomationSection";
import type { SettingsConfigSetter } from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

export function SettingsAssistantAutomationTab(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  return (
    <section id="settings-brain" className="scroll-mt-28">
      <SettingsAssistantAutomationSection config={props.config} setConfig={props.setConfig} />
    </section>
  );
}
