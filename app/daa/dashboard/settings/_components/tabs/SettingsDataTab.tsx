import { DataHealthPanel } from "@/app/daa/dashboard/settings/_components/DataHealthPanel";
import { SettingsDataInitSection } from "@/app/daa/dashboard/settings/_components/SettingsDataInitSection";
import { SettingsDataSourcesSection } from "@/app/daa/dashboard/settings/_components/SettingsDataSourcesSection";
import { SettingsSecretsSection } from "@/app/daa/dashboard/settings/_components/SettingsSecretsSection";
import type { SettingsConfigSetter } from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

export type SettingsDataHealthAsset = {
  assetKey: string;
  symbol: string;
  market: string;
  priceStatus: "fresh" | "stale" | "missing" | "unsupported";
  priceUpdatedAt: string | null;
  priceAgeSec: number | null;
};

export function SettingsDataTab(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
  dataHealthAssets: SettingsDataHealthAsset[];
}) {
  return (
    <section id="settings-data" className="scroll-mt-28 space-y-5">
      <SettingsDataSourcesSection config={props.config} setConfig={props.setConfig} />
      {props.dataHealthAssets.length > 0 ? <DataHealthPanel assets={props.dataHealthAssets} /> : null}
      <SettingsDataInitSection />
      <SettingsSecretsSection />
    </section>
  );
}
