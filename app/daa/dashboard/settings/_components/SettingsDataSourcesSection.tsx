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
      <SectionCard title="数据源与模型" description="把外部行情、资讯、汇率与 AI 解释链路放在一起管理，方便统一检查输入是否完整。">
        <div style={{ display: "grid", gap: 18 }}>
          <div
            style={{
              display: "grid",
              gap: 18,
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              alignItems: "start",
            }}
          >
            <SettingsPriceFeedBlock config={config} setConfig={setConfig} />
            <SettingsNewsResearchBlock config={config} setConfig={setConfig} />
            <SettingsFxFeedBlock config={config} setConfig={setConfig} />
            <SettingsAiAnalysisBlock config={config} setConfig={setConfig} />
          </div>
          <SettingsMarketContextBlock config={config} setConfig={setConfig} />
        </div>
      </SectionCard>
    </section>
  );
}
