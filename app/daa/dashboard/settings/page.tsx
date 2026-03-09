"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { DeepLedgerActionButton, DeepLedgerPageHeader, DeepLedgerSectionAnchor, DeepLedgerStatusPill } from "../_components/DeepLedgerUI";

import { getSystemConfigV2, refreshMarketIndicatorsV1, saveSystemConfigV2 } from "@/src/daa/modules/store/storeApiV1";
import { ApiClientErrorV1 } from "@/src/daa/api/clientV1";
import type { DaaMarketIndicatorConfigKeyV2, DaaSystemConfigV2 } from "@/src/daa/config/systemConfigV2";

const DAA_DASHBOARD_DATA_UPDATED_EVENT_V1 = "daa:dashboard:data-updated";
const DAA_DASHBOARD_REFRESH_EVENT_V1 = "daa:dashboard:refresh";

const SETTINGS_NAV_ITEMS = [
  { id: "strategy", label: "再平衡策略", desc: "调仓节奏、触发条件与自动分析。" },
  { id: "risk", label: "风控参数", desc: "集中度、仓位和止盈止损阈值。" },
  { id: "data", label: "数据源", desc: "行情、资讯、FX、LLM 与市场状态层。" },
  { id: "human-factor", label: "人因数据源", desc: "基金池范围与人工信号叠加。" },
  { id: "notification", label: "通知", desc: "邮件和 Telegram 触发策略。" },
] as const;

const MARKET_INDICATOR_ITEMS: Array<{
  key: DaaMarketIndicatorConfigKeyV2;
  label: string;
  hint: string;
  dependencies: string;
}> = [
  { key: "vix", label: "VIX", hint: "衡量美股隐含波动，越高通常代表美股更偏防守。", dependencies: "^VIX" },
  { key: "qqqSpyRatio", label: "QQQ / SPY", hint: "观察美股成长风格相对宽基大盘的强弱切换。", dependencies: "QQQ, SPY" },
  { key: "fxiVolatility", label: "FXI 波动率", hint: "衡量港股 / 中概代表指数的波动压力。", dependencies: "FXI" },
  { key: "kwebFxiRatio", label: "KWEB / FXI", hint: "观察中概互联网相对中国大盘的风险偏好。", dependencies: "KWEB, FXI" },
  { key: "btcEthRatio", label: "BTC / ETH", hint: "观察加密市场在防守与进攻风格之间的切换。", dependencies: "BTC-USD, ETH-USD" },
  { key: "btcVolatility", label: "BTC 波动率", hint: "衡量加密市场核心资产的波动风险。", dependencies: "BTC-USD" },
  { key: "goldSilverRatio", label: "金银比", hint: "高位通常意味着宏观资金更偏防御。", dependencies: "GC=F, SI=F" },
];

// ──────────────────────────────────────────────
// Styled primitives
// ──────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 6,
  border: "1px solid var(--border-strong)",
  background: "var(--elevated)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "var(--font-body)",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s, box-shadow 0.15s",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: "none",
  cursor: "pointer",
};

function FormInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={inputStyle}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--primary)";
        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(56,189,248,0.12)";
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "var(--border-strong)";
        e.currentTarget.style.boxShadow = "none";
        props.onBlur?.(e);
      }}
    />
  );
}

function FormSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={selectStyle}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--primary)";
        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(56,189,248,0.12)";
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "var(--border-strong)";
        e.currentTarget.style.boxShadow = "none";
      }}
    />
  );
}

function NumberInput(props: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <FormInput
      type="number"
      value={Number.isFinite(props.value) ? props.value : 0}
      min={props.min}
      max={props.max}
      step={props.step || 1}
      disabled={props.disabled}
      onChange={(e) => props.onChange(Number(e.target.value))}
    />
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 500,
        color: "var(--muted)",
        marginBottom: 6,
        letterSpacing: "0.02em",
      }}
    >
      {children}
    </div>
  );
}

function CheckboxRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        fontSize: 13,
        color: "var(--muted)",
        userSelect: "none",
      }}
    >
      <input
        type="checkbox"
        className="daa-checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: "var(--primary)" }}
      />
      {children}
    </label>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: "var(--card)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{title}</div>
        {description && (
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{description}</div>
        )}
      </div>
      <div style={{ padding: "16px" }}>{children}</div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────

export default function SettingsPage() {
  const [version, setVersion] = useState<number | null>(null);
  const [config, setConfig] = useState<DaaSystemConfigV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [baselineConfigText, setBaselineConfigText] = useState("");
  const [activeSection, setActiveSection] = useState<(typeof SETTINGS_NAV_ITEMS)[number]["id"]>("strategy");
  const [marketRefreshing, setMarketRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getSystemConfigV2();
      setVersion(res.version);
      setConfig(res.config);
      setBaselineConfigText(JSON.stringify(res.config));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载设置失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveConfig(): Promise<boolean> {
    if (!config || version == null) return false;
    setSaving(true);
    setError("");
    setHint("");
    try {
      const saved = await saveSystemConfigV2({ config, baseVersion: version });
      setVersion(saved.version);
      setConfig(saved.config);
      setBaselineConfigText(JSON.stringify(saved.config));
      setHint(`保存成功 ${new Date(saved.updatedAt).toLocaleTimeString()}；已生成的再平衡周期需重新生成/刷新建议后才会应用新配置`);
      toast.message("设置已保存；请重新生成或刷新建议，使新配置应用到当前再平衡周期。");
      window.dispatchEvent(
        new CustomEvent(DAA_DASHBOARD_DATA_UPDATED_EVENT_V1, { detail: { ts: Date.now() } }),
      );
      return true;
    } catch (e) {
      if (e instanceof ApiClientErrorV1 && (e.status === 409 || e.code === "VERSION_CONFLICT")) {
        const latestVersion = typeof e.details === "object" && e.details && "latestVersion" in (e.details as Record<string, unknown>)
          ? Number((e.details as Record<string, unknown>).latestVersion)
          : Number.NaN;
        const suffix = Number.isFinite(latestVersion) && latestVersion > 0 ? `（最新版本 ${Math.trunc(latestVersion)}）` : "";
        setError(`配置已被其他操作更新，请刷新后重试${suffix}`);
        return false;
      }
      setError(e instanceof Error ? e.message : "保存失败");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleRefreshMarketContext() {
    if (marketRefreshing) return;
    if (isDirty) {
      const saved = await saveConfig();
      if (!saved) return;
    }
    setMarketRefreshing(true);
    setError("");
    try {
      const result = await refreshMarketIndicatorsV1();
      const message = `市场状态层已刷新，更新 ${result.refreshedCount} 项指标`;
      setHint(message);
      toast.success(message);
      window.dispatchEvent(new CustomEvent(DAA_DASHBOARD_REFRESH_EVENT_V1, { detail: { ts: Date.now(), source: "settings_market_refresh" } }));
    } catch (e) {
      const message = e instanceof Error ? e.message : "刷新市场状态层失败";
      setError(message);
      toast.error(message);
    } finally {
      setMarketRefreshing(false);
    }
  }

  if (loading || !config) {
    return (
      <div
        style={{
          padding: "48px 16px",
          textAlign: "center",
          borderRadius: 10,
          border: "1px dashed var(--border-strong)",
          fontSize: 13,
          color: "var(--faint)",
        }}
      >
        设置加载中...
      </div>
    );
  }

  const gridCols2: React.CSSProperties = {
    display: "grid",
    gap: 16,
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
  };

  const gridCols3: React.CSSProperties = {
    display: "grid",
    gap: 16,
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
  };

  const isDirty = JSON.stringify(config) !== baselineConfigText;

  return (
    <div className="space-y-6 lg:space-y-7">
      <DeepLedgerPageHeader
        eyebrow="System Control"
        title="设置"
        description="按职责配置再平衡策略、风控参数、数据源、人因与通知，并通过固定保存条统一提交。"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <DeepLedgerActionButton
              tone="primary"
              className="h-9 rounded-full px-4 text-xs"
              onClick={() => void handleRefreshMarketContext()}
              disabled={loading || saving || marketRefreshing}
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${marketRefreshing ? "animate-spin" : ""}`} />
              {marketRefreshing ? "刷新市场中..." : isDirty ? "保存并刷新市场状态层" : "立即刷新市场状态层"}
            </DeepLedgerActionButton>
            <DeepLedgerStatusPill tone={isDirty ? "amber" : "green"}>
              {isDirty ? "存在未保存修改" : "已与当前版本同步"}
            </DeepLedgerStatusPill>
            <DeepLedgerStatusPill tone="slate">配置版本 {version ?? "-"}</DeepLedgerStatusPill>
          </div>
        )}
      />

      {error ? (
        <div className="rounded-[18px] border border-[rgba(248,113,113,0.22)] bg-[rgba(248,113,113,0.08)] px-5 py-4 text-sm text-[var(--danger)]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold">设置操作失败</div>
              <div className="mt-1 text-[var(--muted)]">{error}</div>
            </div>
          </div>
        </div>
      ) : null}

      {hint ? (
        <div className="rounded-[18px] border border-[rgba(52,211,153,0.24)] bg-[rgba(52,211,153,0.08)] px-5 py-4 text-sm text-[var(--success)]">
          {hint}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-[104px] xl:self-start">
          <div className="overflow-hidden rounded-[20px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(24,34,54,0.96),rgba(13,19,32,0.98))] shadow-[0_20px_50px_rgba(0,0,0,0.28)]">
            <div className="border-b border-[var(--border)] px-5 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">配置导航</div>
              <div className="mt-2 text-sm leading-6 text-[var(--muted)]">二级导航帮助你在长表单中快速定位模块，并明确当前修改范围。</div>
            </div>
            <div className="space-y-2 px-3 py-3">
              {SETTINGS_NAV_ITEMS.map((item, index) => (
                <div key={item.id} className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.38)] p-2">
                  <DeepLedgerSectionAnchor
                    href={`#settings-${item.id}`}
                    active={activeSection === item.id}
                    label={item.label}
                    onClick={() => setActiveSection(item.id)}
                  />
                  <div className="px-3 pb-2 pt-1 text-xs leading-5 text-[var(--faint)]">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <div className="space-y-5">
          <section id="settings-strategy" className="scroll-mt-28">
      <SectionCard title="再平衡策略" description="支持定期触发和偏移触发，两者可并行启用。">
        <div style={gridCols2}>
          <CheckboxRow
            checked={config.rebalanceStrategy.calendar.enabled}
            onChange={(v) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      rebalanceStrategy: {
                        ...prev.rebalanceStrategy,
                        calendar: { ...prev.rebalanceStrategy.calendar, enabled: v },
                      },
                    }
                  : prev,
              )
            }
          >
            启用定期再平衡
          </CheckboxRow>

          <div>
            <FieldLabel>定期频率</FieldLabel>
            <FormSelect
              value={config.rebalanceStrategy.calendar.frequency}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        rebalanceStrategy: {
                          ...prev.rebalanceStrategy,
                          calendar: {
                            ...prev.rebalanceStrategy.calendar,
                            frequency: e.target.value as DaaSystemConfigV2["rebalanceStrategy"]["calendar"]["frequency"],
                          },
                        },
                      }
                    : prev,
                )
              }
            >
              <option value="monthly">每月</option>
              <option value="quarterly">每季度</option>
              <option value="semi_annual">每半年</option>
              <option value="annual">每年</option>
            </FormSelect>
          </div>

          <div>
            <FieldLabel>执行日 (1-28)</FieldLabel>
            <NumberInput
              value={config.rebalanceStrategy.calendar.dayOfMonth}
              min={1}
              max={28}
              onChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        rebalanceStrategy: {
                          ...prev.rebalanceStrategy,
                          calendar: {
                            ...prev.rebalanceStrategy.calendar,
                            dayOfMonth: Math.max(1, Math.min(28, Math.trunc(value || 1))),
                          },
                        },
                      }
                    : prev,
                )
              }
            />
          </div>

          <CheckboxRow
            checked={config.rebalanceStrategy.drift.enabled}
            onChange={(v) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      rebalanceStrategy: {
                        ...prev.rebalanceStrategy,
                        drift: { ...prev.rebalanceStrategy.drift, enabled: v },
                      },
                    }
                  : prev,
              )
            }
          >
            启用偏移量再平衡
          </CheckboxRow>

          <div>
            <FieldLabel>偏移阈值 (%)</FieldLabel>
            <NumberInput
              value={config.rebalanceStrategy.drift.thresholdPct * 100}
              min={1}
              max={50}
              step={0.5}
              onChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        rebalanceStrategy: {
                          ...prev.rebalanceStrategy,
                          drift: {
                            ...prev.rebalanceStrategy.drift,
                            thresholdPct: Math.max(0.01, Math.min(0.5, value / 100)),
                          },
                        },
                      }
                    : prev,
                )
              }
            />
          </div>

          <div>
            <FieldLabel>检查频率</FieldLabel>
            <FormSelect
              value={config.rebalanceStrategy.drift.checkFrequency}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        rebalanceStrategy: {
                          ...prev.rebalanceStrategy,
                          drift: {
                            ...prev.rebalanceStrategy.drift,
                            checkFrequency: e.target.value as "daily" | "weekly",
                          },
                        },
                      }
                    : prev,
                )
              }
            >
              <option value="daily">每日</option>
              <option value="weekly">每周</option>
            </FormSelect>
          </div>

          <div>
            <FieldLabel>冷静期 (小时)</FieldLabel>
            <NumberInput
              value={config.rebalanceStrategy.cooldownHours}
              min={1}
              max={720}
              onChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        rebalanceStrategy: {
                          ...prev.rebalanceStrategy,
                          cooldownHours: Math.max(1, Math.trunc(value || 1)),
                        },
                      }
                    : prev,
                )
              }
            />
          </div>

          <div>
            <FieldLabel>自动分析时间 (UTC)</FieldLabel>
            <FormInput
              value={config.rebalanceStrategy.analysisTimeUtc}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        rebalanceStrategy: {
                          ...prev.rebalanceStrategy,
                          analysisTimeUtc: e.target.value,
                        },
                      }
                    : prev,
                )
              }
              placeholder="00:20"
            />
          </div>

          <div>
            <FieldLabel>时区</FieldLabel>
            <FormInput
              value={config.rebalanceStrategy.timezone}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        rebalanceStrategy: {
                          ...prev.rebalanceStrategy,
                          timezone: e.target.value,
                        },
                      }
                    : prev,
                )
              }
              placeholder="Asia/Shanghai"
            />
          </div>

          <CheckboxRow
            checked={config.rebalanceStrategy.autoGenerateEnabled}
            onChange={(v) =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      rebalanceStrategy: { ...prev.rebalanceStrategy, autoGenerateEnabled: v },
                    }
                  : prev,
              )
            }
          >
            自动模式（自动生成建议 + 通知）
          </CheckboxRow>

          <div>
            <FieldLabel>通知邮箱</FieldLabel>
            <FormInput
              value={config.rebalanceStrategy.notifyEmailTo}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        rebalanceStrategy: {
                          ...prev.rebalanceStrategy,
                          notifyEmailTo: e.target.value.trim(),
                        },
                      }
                    : prev,
                )
              }
              placeholder="name@example.com"
            />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <FieldLabel>LLM 分析焦点</FieldLabel>
            <FormInput
              value={config.rebalanceStrategy.analysisFocus}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        rebalanceStrategy: {
                          ...prev.rebalanceStrategy,
                          analysisFocus: e.target.value,
                        },
                      }
                    : prev,
                )
              }
            />
          </div>
        </div>
      </SectionCard>
          </section>

          <section id="settings-risk" className="scroll-mt-28">

      <SectionCard title="风控参数">
        <div style={gridCols3}>
          {[
            {
              label: "单一持仓上限 (%)",
              value: config.strategy.constraints.maxPositionPct * 100,
              min: 1, max: 100, step: 0.5,
              onChange: (v: number) => setConfig((prev) => prev ? ({ ...prev, strategy: { ...prev.strategy, constraints: { ...prev.strategy.constraints, maxPositionPct: Math.max(0.01, Math.min(1, v / 100)) } } }) : prev),
            },
            {
              label: "单日交易上限 (%)",
              value: config.strategy.constraints.maxOrderPctOfNav * 100,
              min: 1, max: 100, step: 0.5,
              onChange: (v: number) => setConfig((prev) => prev ? ({ ...prev, strategy: { ...prev.strategy, constraints: { ...prev.strategy.constraints, maxOrderPctOfNav: Math.max(0.01, Math.min(1, v / 100)) } } }) : prev),
            },
            {
              label: "最小交易金额",
              value: config.strategy.constraints.minNotional,
              min: 1, step: 10,
              onChange: (v: number) => setConfig((prev) => prev ? ({ ...prev, strategy: { ...prev.strategy, constraints: { ...prev.strategy.constraints, minNotional: Math.max(1, v) } } }) : prev),
            },
            {
              label: "默认手续费 (bps)",
              value: config.strategy.execution.feeRateBps,
              min: 0, max: 500, step: 0.1,
              onChange: (v: number) => setConfig((prev) => prev ? ({ ...prev, strategy: { ...prev.strategy, execution: { ...prev.strategy.execution, feeRateBps: Math.max(0, Math.min(500, v)) } } }) : prev),
            },
            {
              label: "默认滑点 (bps)",
              value: config.strategy.execution.slippageBps,
              min: 0, max: 500, step: 0.1,
              onChange: (v: number) => setConfig((prev) => prev ? ({ ...prev, strategy: { ...prev.strategy, execution: { ...prev.strategy.execution, slippageBps: Math.max(0, Math.min(500, v)) } } }) : prev),
            },
            {
              label: "最大回撤阈值 (%)",
              value: config.strategy.risk.maxDrawdownPct * 100,
              min: 5, max: 80, step: 0.5,
              onChange: (v: number) => setConfig((prev) => prev ? ({ ...prev, strategy: { ...prev.strategy, risk: { ...prev.strategy.risk, maxDrawdownPct: Math.max(0.05, Math.min(0.8, v / 100)) } } }) : prev),
            },
            {
              label: "单资产止损阈值 (%)",
              value: config.strategy.risk.perAssetStopLossPct * 100,
              min: 5, max: 80, step: 0.5,
              onChange: (v: number) => setConfig((prev) => prev ? ({ ...prev, strategy: { ...prev.strategy, risk: { ...prev.strategy.risk, perAssetStopLossPct: Math.max(0.05, Math.min(0.8, v / 100)) } } }) : prev),
            },
            {
              label: "单资产止盈阈值 (%)",
              value: (config.strategy.risk.perAssetTakeProfitPct ?? 0.25) * 100,
              min: 5, max: 150, step: 0.5,
              onChange: (v: number) => setConfig((prev) => prev ? ({ ...prev, strategy: { ...prev.strategy, risk: { ...prev.strategy.risk, perAssetTakeProfitPct: Math.max(0.05, Math.min(1.5, v / 100)) } } }) : prev),
            },
            {
              label: "集中度阈值 HHI",
              value: config.strategy.risk.maxConcentrationPct * 100,
              min: 10, max: 100, step: 1,
              onChange: (v: number) => setConfig((prev) => prev ? ({ ...prev, strategy: { ...prev.strategy, risk: { ...prev.strategy.risk, maxConcentrationPct: Math.max(0.1, Math.min(1, v / 100)) } } }) : prev),
            },
          ].map((field) => (
            <div key={field.label}>
              <FieldLabel>{field.label}</FieldLabel>
              <NumberInput
                value={field.value}
                min={field.min}
                max={field.max}
                step={field.step}
                onChange={field.onChange}
              />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, color: "var(--muted)", fontSize: 12 }}>
          历史研究与工作台执行摘要共享同一套执行口径：单笔 NAV 上限、手续费、滑点与成交时点。当前成交时点固定为 T+1 close。
        </div>
      </SectionCard>
          </section>

          <section id="settings-data" className="scroll-mt-28">

      <SectionCard title="数据源" description="行情、资讯、汇率、LLM 与市场状态层配置。">
        <div style={gridCols2}>
          <CheckboxRow
            checked={config.dataSources.priceFeed.enabled}
            onChange={(v) =>
              setConfig((prev) =>
                prev
                  ? { ...prev, dataSources: { ...prev.dataSources, priceFeed: { ...prev.dataSources.priceFeed, enabled: v } } }
                  : prev,
              )
            }
          >
            启用行情源
          </CheckboxRow>

          <div>
            <FieldLabel>行情 Provider</FieldLabel>
            <FormInput
              value={config.dataSources.priceFeed.provider}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? { ...prev, dataSources: { ...prev.dataSources, priceFeed: { ...prev.dataSources.priceFeed, provider: e.target.value.trim() || "yfinance" } } }
                    : prev,
                )
              }
            />
          </div>

          <div>
            <FieldLabel>行情刷新间隔 (分钟)</FieldLabel>
            <NumberInput
              value={config.dataSources.priceFeed.intervalMinutes}
              min={1}
              max={240}
              onChange={(v) =>
                setConfig((prev) =>
                  prev
                    ? { ...prev, dataSources: { ...prev.dataSources, priceFeed: { ...prev.dataSources.priceFeed, intervalMinutes: Math.max(1, Math.trunc(v || 1)) } } }
                    : prev,
                )
              }
            />
          </div>

          <div>
            <FieldLabel>缓存新鲜阈值 (分钟)</FieldLabel>
            <NumberInput
              value={config.dataSources.priceFeed.marketCache.freshMinutes}
              min={1}
              max={180}
              onChange={(v) =>
                setConfig((prev) =>
                  prev
                    ? { ...prev, dataSources: { ...prev.dataSources, priceFeed: { ...prev.dataSources.priceFeed, marketCache: { ...prev.dataSources.priceFeed.marketCache, freshMinutes: Math.max(1, Math.min(180, Math.trunc(v || 1))) } } } }
                    : prev,
                )
              }
            />
          </div>

          <div>
            <FieldLabel>可服务陈旧窗口 (小时)</FieldLabel>
            <NumberInput
              value={config.dataSources.priceFeed.marketCache.serveStaleHours}
              min={1}
              max={168}
              onChange={(v) =>
                setConfig((prev) =>
                  prev
                    ? { ...prev, dataSources: { ...prev.dataSources, priceFeed: { ...prev.dataSources.priceFeed, marketCache: { ...prev.dataSources.priceFeed.marketCache, serveStaleHours: Math.max(1, Math.min(168, Math.trunc(v || 1))) } } } }
                    : prev,
                )
              }
            />
          </div>

          <div>
            <FieldLabel>Raw 保留天数</FieldLabel>
            <NumberInput
              value={config.dataSources.priceFeed.marketCache.rawRetentionDays}
              min={7}
              max={365}
              onChange={(v) =>
                setConfig((prev) =>
                  prev
                    ? { ...prev, dataSources: { ...prev.dataSources, priceFeed: { ...prev.dataSources.priceFeed, marketCache: { ...prev.dataSources.priceFeed.marketCache, rawRetentionDays: Math.max(7, Math.min(365, Math.trunc(v || 7))) } } } }
                    : prev,
                )
              }
            />
          </div>

          <CheckboxRow
            checked={config.dataSources.newsFeed.enabled}
            onChange={(v) =>
              setConfig((prev) =>
                prev
                  ? { ...prev, dataSources: { ...prev.dataSources, newsFeed: { ...prev.dataSources.newsFeed, enabled: v } } }
                  : prev,
              )
            }
          >
            启用资讯源
          </CheckboxRow>

          {/* Fusion weights */}
          <div style={{ gridColumn: "1 / -1" }}>
            <FieldLabel>信号融合权重（自动归一）</FieldLabel>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 12 }}>
              {(
                [
                  { key: "human", label: "人因" },
                  { key: "news", label: "新闻" },
                  { key: "technical", label: "技术" },
                  { key: "valuation", label: "估值" },
                ] as const
              ).map(({ key, label }) => (
                <div key={key}>
                  <div style={{ fontSize: 11, color: "var(--faint)", marginBottom: 4 }}>{label}</div>
                  <NumberInput
                    value={config.dataSources.newsFeed.fusionWeights[key]}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(v) =>
                      setConfig((prev) =>
                        prev
                          ? { ...prev, dataSources: { ...prev.dataSources, newsFeed: { ...prev.dataSources.newsFeed, fusionWeights: { ...prev.dataSources.newsFeed.fusionWeights, [key]: Math.max(0, v) } } } }
                          : prev,
                      )
                    }
                  />
                </div>
              ))}
            </div>

            <CheckboxRow
              checked={config.dataSources.newsFeed.valuationEnabled !== false}
              onChange={(v) =>
                setConfig((prev) =>
                  prev
                    ? { ...prev, dataSources: { ...prev.dataSources, newsFeed: { ...prev.dataSources.newsFeed, valuationEnabled: v } } }
                    : prev,
                )
              }
            >
              估值打分参与建议（关闭后仅展示估值信息，不参与最终动作）
            </CheckboxRow>

            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {[
                { label: "平衡", weights: { human: 0.35, news: 0.2, technical: 0.25, valuation: 0.2 } },
                { label: "技术优先", weights: { human: 0.2, news: 0.15, technical: 0.45, valuation: 0.2 } },
                { label: "价值优先", weights: { human: 0.2, news: 0.15, technical: 0.2, valuation: 0.45 } },
                { label: "人因优先", weights: { human: 0.55, news: 0.15, technical: 0.15, valuation: 0.15 } },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    setConfig((prev) =>
                      prev
                        ? { ...prev, dataSources: { ...prev.dataSources, newsFeed: { ...prev.dataSources.newsFeed, fusionWeights: preset.weights } } }
                        : prev,
                    )
                  }
                  style={{
                    padding: "4px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: "pointer",
                    border: "1px solid var(--border-strong)",
                    background: "var(--elevated)",
                    color: "var(--muted)",
                    fontFamily: "var(--font-body)",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--primary)";
                    e.currentTarget.style.color = "var(--primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-strong)";
                    e.currentTarget.style.color = "var(--muted)";
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <CheckboxRow
            checked={config.dataSources.fxFeed.enabled}
            onChange={(v) =>
              setConfig((prev) =>
                prev
                  ? { ...prev, dataSources: { ...prev.dataSources, fxFeed: { ...prev.dataSources.fxFeed, enabled: v } } }
                  : prev,
              )
            }
          >
            启用汇率源
          </CheckboxRow>

          <div>
            <FieldLabel>汇率币对</FieldLabel>
            <FormInput
              value={config.dataSources.fxFeed.pairs.join(", ")}
              onChange={(e) => {
                const pairs = e.target.value
                  .split(/[,\s]+/g)
                  .map((item) => item.trim().toUpperCase().replace(/-/g, "/"))
                  .filter((item) => /^[A-Z]{3}\/[A-Z]{3}$/.test(item));
                setConfig((prev) =>
                  prev
                    ? { ...prev, dataSources: { ...prev.dataSources, fxFeed: { ...prev.dataSources.fxFeed, pairs: [...new Set(pairs)] } } }
                    : prev,
                );
              }}
            />
          </div>

          <CheckboxRow
            checked={config.dataSources.llmAnalysis.enabled}
            onChange={(v) =>
              setConfig((prev) =>
                prev
                  ? { ...prev, dataSources: { ...prev.dataSources, llmAnalysis: { ...prev.dataSources.llmAnalysis, enabled: v } } }
                  : prev,
              )
            }
          >
            启用 LLM 分析
          </CheckboxRow>

          <div>
            <FieldLabel>模型</FieldLabel>
            <FormInput
              value={config.dataSources.llmAnalysis.model}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? { ...prev, dataSources: { ...prev.dataSources, llmAnalysis: { ...prev.dataSources.llmAnalysis, model: e.target.value.trim() || "gpt-5-codex" } } }
                    : prev,
                )
              }
            />
          </div>

          <div
            style={{
              gridColumn: "1 / -1",
              marginTop: 4,
              padding: 16,
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "linear-gradient(180deg, rgba(12,18,30,0.84), rgba(8,12,20,0.76))",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>市场状态层</div>
                <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
                  现在按市场拆分为美股、港股 / 中概、加密与宏观防御四组环境，只影响对应市场的买入执行系数、风险提示与 AI 输入解释。
                </div>
              </div>
              <CheckboxRow
                checked={config.dataSources.marketIndicators.enabled}
                onChange={(v) =>
                  setConfig((prev) =>
                    prev
                      ? { ...prev, dataSources: { ...prev.dataSources, marketIndicators: { ...prev.dataSources.marketIndicators, enabled: v } } }
                      : prev,
                  )
                }
              >
                启用市场状态层
              </CheckboxRow>
            </div>

            <div style={{ ...gridCols2, marginTop: 16 }}>
              <div>
                <FieldLabel>刷新间隔（分钟）</FieldLabel>
                <NumberInput
                  value={config.dataSources.marketIndicators.refreshIntervalMinutes}
                  min={5}
                  max={240}
                  onChange={(v) =>
                    setConfig((prev) =>
                      prev
                        ? { ...prev, dataSources: { ...prev.dataSources, marketIndicators: { ...prev.dataSources.marketIndicators, refreshIntervalMinutes: Math.max(5, Math.min(240, Math.trunc(v || 5))) } } }
                        : prev,
                    )
                  }
                />
              </div>

              <div style={{ gridColumn: "1 / -1", borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)", padding: "10px 12px" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>市场划分说明</div>
                <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
                  美股使用 VIX 与 QQQ / SPY；港股 / 中概使用 FXI 波动率与 KWEB / FXI；加密使用 BTC / ETH 与 BTC 波动率；宏观防御使用金银比作为辅助观察。
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--elevated)",
                fontSize: 12,
                color: "var(--muted)",
                lineHeight: 1.7,
              }}
            >
              固定依赖：VIX → ^VIX；QQQ / SPY → QQQ / SPY；FXI 波动率 → FXI；KWEB / FXI → KWEB / FXI；BTC / ETH → BTC-USD / ETH-USD；BTC 波动率 → BTC-USD；金银比 → GC=F / SI=F。
            </div>

            <div style={{ marginTop: 16 }}>
              <FieldLabel>指标开关与权重</FieldLabel>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                {MARKET_INDICATOR_ITEMS.map((item) => (
                  <div
                    key={item.key}
                    style={{
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "rgba(255,255,255,0.02)",
                      padding: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{item.label}</div>
                        <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>{item.hint}</div>
                        <div style={{ marginTop: 6, fontSize: 11, color: "var(--faint)" }}>依赖：{item.dependencies}</div>
                      </div>
                      <CheckboxRow
                        checked={config.dataSources.marketIndicators.indicators[item.key].enabled}
                        onChange={(v) =>
                          setConfig((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  dataSources: {
                                    ...prev.dataSources,
                                    marketIndicators: {
                                      ...prev.dataSources.marketIndicators,
                                      indicators: {
                                        ...prev.dataSources.marketIndicators.indicators,
                                        [item.key]: {
                                          ...prev.dataSources.marketIndicators.indicators[item.key],
                                          enabled: v,
                                        },
                                      },
                                    },
                                  },
                                }
                              : prev,
                          )
                        }
                      >
                        启用
                      </CheckboxRow>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <FieldLabel>权重</FieldLabel>
                      <NumberInput
                        value={config.dataSources.marketIndicators.indicators[item.key].weight}
                        min={0}
                        max={5}
                        step={0.05}
                        onChange={(v) =>
                          setConfig((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  dataSources: {
                                    ...prev.dataSources,
                                    marketIndicators: {
                                      ...prev.dataSources.marketIndicators,
                                      indicators: {
                                        ...prev.dataSources.marketIndicators.indicators,
                                        [item.key]: {
                                          ...prev.dataSources.marketIndicators.indicators[item.key],
                                          weight: Math.max(0, Math.min(5, Number.isFinite(v) ? v : 0)),
                                        },
                                      },
                                    },
                                  },
                                }
                              : prev,
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <FieldLabel>Overlay 参数</FieldLabel>
              <div style={gridCols3}>
                <div>
                  <FieldLabel>过渡环境买入执行系数</FieldLabel>
                  <NumberInput
                    value={config.dataSources.marketIndicators.overlays.transitionalBuyScale}
                    min={0.2}
                    max={1}
                    step={0.01}
                    onChange={(v) =>
                      setConfig((prev) =>
                        prev
                          ? { ...prev, dataSources: { ...prev.dataSources, marketIndicators: { ...prev.dataSources.marketIndicators, overlays: { ...prev.dataSources.marketIndicators.overlays, transitionalBuyScale: Math.max(0.2, Math.min(1, v || 0.2)) } } } }
                          : prev,
                      )
                    }
                  />
                </div>

                <div>
                  <FieldLabel>偏防守环境买入执行系数</FieldLabel>
                  <NumberInput
                    value={config.dataSources.marketIndicators.overlays.riskOffBuyScale}
                    min={0.2}
                    max={1}
                    step={0.01}
                    onChange={(v) =>
                      setConfig((prev) =>
                        prev
                          ? { ...prev, dataSources: { ...prev.dataSources, marketIndicators: { ...prev.dataSources.marketIndicators, overlays: { ...prev.dataSources.marketIndicators.overlays, riskOffBuyScale: Math.max(0.2, Math.min(1, v || 0.2)) } } } }
                          : prev,
                      )
                    }
                  />
                </div>

                <div>
                  <FieldLabel>高波动资产买入执行系数</FieldLabel>
                  <NumberInput
                    value={config.dataSources.marketIndicators.overlays.highRiskBuyScale}
                    min={0.1}
                    max={1}
                    step={0.01}
                    onChange={(v) =>
                      setConfig((prev) =>
                        prev
                          ? { ...prev, dataSources: { ...prev.dataSources, marketIndicators: { ...prev.dataSources.marketIndicators, overlays: { ...prev.dataSources.marketIndicators.overlays, highRiskBuyScale: Math.max(0.1, Math.min(1, v || 0.1)) } } } }
                          : prev,
                      )
                    }
                  />
                </div>

              </div>
            </div>
          </div>
        </div>
      </SectionCard>
          </section>

          <section id="settings-human-factor" className="scroll-mt-28">

      <SectionCard title="人因数据源" description="信号叠加层配置与基金池范围。">
        <div style={gridCols2}>
          <CheckboxRow
            checked={config.dataSources.hfFund.enabled}
            onChange={(v) =>
              setConfig((prev) =>
                prev
                  ? { ...prev, dataSources: { ...prev.dataSources, hfFund: { ...prev.dataSources.hfFund, enabled: v } } }
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
                    ? { ...prev, dataSources: { ...prev.dataSources, hfFund: { ...prev.dataSources.hfFund, marketScope: [...new Set(marketScope)] } } }
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
            当前基金池数量：{config.dataSources.hfFund.funds.length}（如需增删基金，可通过后续基金池管理功能维护）
          </div>
        </div>
      </SectionCard>
          </section>

          <section id="settings-notification" className="scroll-mt-28">

      <SectionCard title="通知">
        <div style={gridCols2}>
          <CheckboxRow
            checked={config.notification.email.onSuggestionGenerated}
            onChange={(v) =>
              setConfig((prev) =>
                prev
                  ? { ...prev, notification: { ...prev.notification, email: { ...prev.notification.email, onSuggestionGenerated: v } } }
                  : prev,
              )
            }
          >
            再平衡建议生成时发送邮件
          </CheckboxRow>

          <CheckboxRow
            checked={config.notification.email.dailyReport}
            onChange={(v) =>
              setConfig((prev) =>
                prev
                  ? { ...prev, notification: { ...prev.notification, email: { ...prev.notification.email, dailyReport: v } } }
                  : prev,
              )
            }
          >
            发送每日分析报告
          </CheckboxRow>

          <CheckboxRow
            checked={config.notification.telegram.enabled}
            onChange={(v) =>
              setConfig((prev) =>
                prev
                  ? { ...prev, notification: { ...prev.notification, telegram: { ...prev.notification.telegram, enabled: v } } }
                  : prev,
              )
            }
          >
            启用 Telegram
          </CheckboxRow>

          <CheckboxRow
            checked={config.notification.telegram.onDriftTrigger}
            onChange={(v) =>
              setConfig((prev) =>
                prev
                  ? { ...prev, notification: { ...prev.notification, telegram: { ...prev.notification.telegram, onDriftTrigger: v } } }
                  : prev,
              )
            }
          >
            偏移触发时通知
          </CheckboxRow>
        </div>
      </SectionCard>
          </section>
        </div>
      </div>

      <div className="sticky bottom-4 z-20">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 rounded-[20px] border border-[var(--border)] bg-[rgba(8,12,20,0.9)] px-5 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-[var(--text)]">配置保存条</div>
            <div className="mt-1 text-sm text-[var(--muted)]">
              {isDirty ? "你有未保存的修改，建议在离开页面前统一保存。" : "当前页面没有未保存的变更。"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void saveConfig()}
            disabled={saving || !isDirty}
            className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-[var(--bg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[var(--elevated)] disabled:text-[var(--muted)] disabled:opacity-70"
          >
            <Save className="h-4 w-4" />
            {saving ? "保存中..." : isDirty ? "保存全部设置" : "暂无变更"}
          </button>
        </div>
      </div>
    </div>
  );
}
