import { SettingsRiskSection } from "@/app/daa/dashboard/settings/_components/SettingsRiskSection";
import { SettingsStrategySection } from "@/app/daa/dashboard/settings/_components/SettingsStrategySection";
import type { SettingsConfigSetter } from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

export function SettingsStrategyTab(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  return (
    <section id="settings-strategy" className="scroll-mt-28 space-y-5">
      <SettingsStrategySection config={props.config} setConfig={props.setConfig} />
      <SettingsRiskSection config={props.config} setConfig={props.setConfig} />
    </section>
  );
}
