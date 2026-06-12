import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

import {
  CheckboxRow,
  SubsectionCard,
  type SettingsConfigSetter,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";

export function SettingsHumanFactorSection(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  const { config, setConfig } = props;

  return (
    <section id="settings-human-factor" className="scroll-mt-28">
      <SubsectionCard title="人因输入与基金池">
        <div className="grid gap-4 md:grid-cols-2">
          <CheckboxRow
            checked={config.dataSources.hfFund.enabled}
            onChange={(value) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      dataSources: {
                        ...prev.dataSources,
                        hfFund: { ...prev.dataSources.hfFund, enabled: value },
                      },
                    }
                  : prev,
              )
            }
          >
            启用人因信号
          </CheckboxRow>

          <div className="border border-[var(--border)] bg-[var(--elevated)] px-3 py-2 text-xs leading-6 text-[var(--muted)] md:col-span-2">
            当前基金池数量：{config.dataSources.hfFund.funds.length}。后续若要增删基金，统一通过基金池管理入口维护。
          </div>
        </div>
      </SubsectionCard>
    </section>
  );
}
