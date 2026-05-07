import { SettingsBrainSection } from "@/app/daa/dashboard/settings/_components/SettingsBrainSection";
import type { SettingsConfigSetter } from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

export function SettingsBrainTab(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  return (
    <section id="settings-brain" className="scroll-mt-28">
      <SettingsBrainSection config={props.config} setConfig={props.setConfig} />
    </section>
  );
}
