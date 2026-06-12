import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

import { SectionCard, type SettingsConfigSetter } from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";
import { SettingsHumanFactorSection } from "@/app/daa/dashboard/settings/_components/SettingsHumanFactorSection";
import { SettingsModelRoutingBlock } from "@/app/daa/dashboard/settings/_components/data-sources/SettingsModelRoutingBlock";
import { SettingsFxFeedBlock } from "@/app/daa/dashboard/settings/_components/data-sources/SettingsFxFeedBlock";
import { SettingsMarketContextBlock } from "@/app/daa/dashboard/settings/_components/data-sources/SettingsMarketContextBlock";
import { SettingsNewsResearchBlock } from "@/app/daa/dashboard/settings/_components/data-sources/SettingsNewsResearchBlock";
import { SettingsPriceFeedBlock } from "@/app/daa/dashboard/settings/_components/data-sources/SettingsPriceFeedBlock";

export function SettingsDataSourcesSection(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  const { config, setConfig } = props;

  return (
    <section id="settings-data-sources" className="scroll-mt-28">
      <SectionCard title="数据源与模型">
        <div className="grid gap-4">
          <SettingsModelRoutingBlock config={config} setConfig={setConfig} />
          <div className="grid items-start gap-4 xl:grid-cols-3">
            <SettingsPriceFeedBlock config={config} setConfig={setConfig} />
            <SettingsNewsResearchBlock config={config} setConfig={setConfig} />
            <SettingsFxFeedBlock config={config} setConfig={setConfig} />
          </div>
          <SettingsHumanFactorSection config={config} setConfig={setConfig} />
          <SettingsMarketContextBlock config={config} setConfig={setConfig} />
        </div>
      </SectionCard>
    </section>
  );
}
