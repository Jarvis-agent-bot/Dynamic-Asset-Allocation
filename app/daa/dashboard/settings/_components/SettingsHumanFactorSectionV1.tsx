import type { DaaSystemConfigV2 } from "@/src/daa/config/systemConfigV2";

import {
  CheckboxRowV1,
  FieldLabelV1,
  FormInputV1,
  SectionCardV1,
  settingsGridCols2StyleV1,
  type SettingsConfigSetterV1,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitivesV1";

export function SettingsHumanFactorSectionV1(props: {
  config: DaaSystemConfigV2;
  setConfig: SettingsConfigSetterV1;
}) {
  const { config, setConfig } = props;

  return (
    <section id="settings-human-factor" className="scroll-mt-28">
      <SectionCardV1 title="人因数据源" description="信号叠加层配置与基金池范围。">
        <div style={settingsGridCols2StyleV1}>
          <CheckboxRowV1
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
          </CheckboxRowV1>

          <div>
            <FieldLabelV1>市场范围</FieldLabelV1>
            <FormInputV1
              value={config.dataSources.hfFund.marketScope.join(", ")}
              onChange={(e) => {
                const marketScope = e.target.value
                  .split(/[,\s]+/g)
                  .map((item) => item.trim().toUpperCase())
                  .filter(Boolean);
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        dataSources: {
                          ...prev.dataSources,
                          hfFund: {
                            ...prev.dataSources.hfFund,
                            marketScope: [...new Set(marketScope)],
                          },
                        },
                      }
                    : prev,
                );
              }}
            />
          </div>

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
      </SectionCardV1>
    </section>
  );
}
