import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

import {
  CheckboxRow,
  SectionCard,
  settingsGridCols2Style,
  type SettingsConfigSetter,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";

export function SettingsHumanFactorSection(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  const { config, setConfig } = props;

  return (
    <section id="settings-human-factor" className="scroll-mt-28">
      <SectionCard title="人因输入与基金池">
        <div style={settingsGridCols2Style}>
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

          <div
            style={{
              gridColumn: "1 / -1",
              padding: "10px 12px",
              borderRadius: 6,
              background: "var(--elevated)",
              border: "1px solid var(--border)",
              fontSize: 12,
              color: "var(--muted)",
            }}
          >
            当前基金池数量：{config.dataSources.hfFund.funds.length}。后续若要增删基金，统一通过基金池管理入口维护。
          </div>
        </div>
      </SectionCard>
    </section>
  );
}
