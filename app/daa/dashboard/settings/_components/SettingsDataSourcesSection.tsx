import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

import { SectionCard, type SettingsConfigSetter } from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";
import { SettingsAiAnalysisBlock } from "@/app/daa/dashboard/settings/_components/data-sources/SettingsAiAnalysisBlock";
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
    <section id="settings-data" className="scroll-mt-28">
      <SectionCard title="数据源" description="行情、资讯、汇率、AI 解读与市场状态层配置。">
        <div style={{ display: "grid", gap: 16 }}>
          <SettingsPriceFeedBlock config={config} setConfig={setConfig} />
          <SettingsNewsResearchBlock config={config} setConfig={setConfig} />
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            <SettingsFxFeedBlock config={config} setConfig={setConfig} />
            <SettingsAiAnalysisBlock config={config} setConfig={setConfig} />
          </div>
          <SettingsMarketContextBlock config={config} setConfig={setConfig} />
        </div>
      </SectionCard>
    </section>
  );
}
