import type { DaaSystemConfigV2 } from "@/src/daa/config/systemConfigV2";

import { SectionCardV1, type SettingsConfigSetterV1 } from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitivesV1";
import { SettingsAiAnalysisBlockV1 } from "@/app/daa/dashboard/settings/_components/data-sources/SettingsAiAnalysisBlockV1";
import { SettingsFxFeedBlockV1 } from "@/app/daa/dashboard/settings/_components/data-sources/SettingsFxFeedBlockV1";
import { SettingsMarketContextBlockV1 } from "@/app/daa/dashboard/settings/_components/data-sources/SettingsMarketContextBlockV1";
import { SettingsNewsResearchBlockV1 } from "@/app/daa/dashboard/settings/_components/data-sources/SettingsNewsResearchBlockV1";
import { SettingsPriceFeedBlockV1 } from "@/app/daa/dashboard/settings/_components/data-sources/SettingsPriceFeedBlockV1";

export function SettingsDataSourcesSectionV1(props: {
  config: DaaSystemConfigV2;
  setConfig: SettingsConfigSetterV1;
}) {
  const { config, setConfig } = props;

  return (
    <section id="settings-data" className="scroll-mt-28">
      <SectionCardV1 title="数据源" description="行情、资讯、汇率、AI 解读与市场状态层配置。">
        <div style={{ display: "grid", gap: 16 }}>
          <SettingsPriceFeedBlockV1 config={config} setConfig={setConfig} />
          <SettingsNewsResearchBlockV1 config={config} setConfig={setConfig} />
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            <SettingsFxFeedBlockV1 config={config} setConfig={setConfig} />
            <SettingsAiAnalysisBlockV1 config={config} setConfig={setConfig} />
          </div>
          <SettingsMarketContextBlockV1 config={config} setConfig={setConfig} />
        </div>
      </SectionCardV1>
    </section>
  );
}
