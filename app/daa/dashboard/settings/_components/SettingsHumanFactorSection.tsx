import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

import {
  CheckboxRow,
  FieldLabel,
  FormInput,
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
      <SectionCard title="人因输入与基金池" description="把人工观察范围与辅助信号放到数据输入层统一管理。">
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

          <div>
            <FieldLabel>市场范围</FieldLabel>
            <FormInput
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
      </SectionCard>
    </section>
  );
}
