import { SettingsNotificationSection } from "@/app/daa/dashboard/settings/_components/SettingsNotificationSection";
import type { SettingsConfigSetter } from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

export function SettingsNotificationTab(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  return (
    <section id="settings-notification" className="scroll-mt-28">
      <SettingsNotificationSection config={props.config} setConfig={props.setConfig} />
    </section>
  );
}
