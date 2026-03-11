"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { formatDateTimeV1 } from "@/app/daa/dashboard/_components/daaFormatters";
import { DashboardEmptyStateV1, DashboardErrorNoticeV1, DashboardSuccessNoticeV1 } from "@/app/daa/dashboard/_components/DashboardFeedbackV1";
import { DeepLedgerActionButton, DeepLedgerPageHeader, DeepLedgerSectionAnchor, DeepLedgerStatusPill } from "@/app/daa/dashboard/_components/DeepLedgerUI";
import { SettingsDataSourcesSectionV1 } from "@/app/daa/dashboard/settings/_components/SettingsDataSourcesSectionV1";
import {
  SETTINGS_NAV_ITEMS_V1,
  type SettingsNavItemIdV1,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitivesV1";
import { SettingsHumanFactorSectionV1 } from "@/app/daa/dashboard/settings/_components/SettingsHumanFactorSectionV1";
import { SettingsNotificationSectionV1 } from "@/app/daa/dashboard/settings/_components/SettingsNotificationSectionV1";
import { SettingsRiskSectionV1 } from "@/app/daa/dashboard/settings/_components/SettingsRiskSectionV1";
import { SettingsStrategySectionV1 } from "@/app/daa/dashboard/settings/_components/SettingsStrategySectionV1";
import { ApiClientErrorV1 } from "@/src/daa/api/clientV1";
import type { DaaSystemConfigV2 } from "@/src/daa/config/systemConfigV2";
import { getSystemConfigV2, refreshMarketIndicatorsV1, saveSystemConfigV2 } from "@/src/daa/modules/store/storeApiV1";

const DAA_DASHBOARD_DATA_UPDATED_EVENT_V1 = "daa:dashboard:data-updated";
const DAA_DASHBOARD_REFRESH_EVENT_V1 = "daa:dashboard:refresh";
const SETTINGS_PAGE_DESCRIPTION_V1 = "按职责配置再平衡策略、风控参数、数据源、人因与通知，并通过固定保存条统一提交。";

export default function SettingsPage() {
  const [version, setVersion] = useState<number | null>(null);
  const [config, setConfig] = useState<DaaSystemConfigV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [baselineConfigText, setBaselineConfigText] = useState("");
  const [activeSection, setActiveSection] = useState<SettingsNavItemIdV1>("strategy");
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

  const isDirty = useMemo(() => {
    if (!config) return false;
    return JSON.stringify(config) !== baselineConfigText;
  }, [baselineConfigText, config]);

  const saveConfig = useCallback(async (): Promise<boolean> => {
    if (!config || version == null) return false;
    setSaving(true);
    setError("");
    setHint("");
    try {
      const saved = await saveSystemConfigV2({ config, baseVersion: version });
      setVersion(saved.version);
      setConfig(saved.config);
      setBaselineConfigText(JSON.stringify(saved.config));
      setHint(`保存成功 ${formatDateTimeV1(saved.updatedAt)}；已生成的再平衡周期需重新生成/刷新建议后才会应用新配置`);
      toast.message("设置已保存；请重新生成或刷新建议，使新配置应用到当前再平衡周期。");
      window.dispatchEvent(new CustomEvent(DAA_DASHBOARD_DATA_UPDATED_EVENT_V1, { detail: { ts: Date.now() } }));
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
  }, [config, version]);

  const handleRefreshMarketContext = useCallback(async () => {
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
  }, [isDirty, marketRefreshing, saveConfig]);

  if (loading) {
    return (
      <div className="space-y-6 lg:space-y-7">
        <DeepLedgerPageHeader eyebrow="系统控制" title="设置" description={SETTINGS_PAGE_DESCRIPTION_V1} />
        <DashboardEmptyStateV1 title="正在加载设置…" description="正在同步最新配置与市场状态层，请稍候。" className="px-5 py-16" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="space-y-6 lg:space-y-7">
        <DeepLedgerPageHeader
          eyebrow="系统控制"
          title="设置"
          description={SETTINGS_PAGE_DESCRIPTION_V1}
          actions={(
            <DeepLedgerActionButton tone="primary" className="h-9 rounded-full px-4 text-xs" onClick={() => void load()}>
              <RefreshCcw className="h-3.5 w-3.5" />
              重新加载设置
            </DeepLedgerActionButton>
          )}
        />
        <DashboardErrorNoticeV1 title="设置加载失败" description={error || "设置服务暂时不可用，请稍后重试。"} />
      </div>
    );
  }

  return (
    <div className="space-y-6 lg:space-y-7">
      <DeepLedgerPageHeader
        eyebrow="系统控制"
        title="设置"
        description={SETTINGS_PAGE_DESCRIPTION_V1}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <DeepLedgerActionButton
              tone="primary"
              className="h-9 rounded-full px-4 text-xs"
              onClick={() => void handleRefreshMarketContext()}
              disabled={loading || saving || marketRefreshing}
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${marketRefreshing ? "animate-spin" : ""}`} />
              {marketRefreshing ? "刷新市场中…" : isDirty ? "保存并刷新市场状态层" : "立即刷新市场状态层"}
            </DeepLedgerActionButton>
            <DeepLedgerStatusPill tone={isDirty ? "amber" : "green"}>{isDirty ? "存在未保存修改" : "已与当前版本同步"}</DeepLedgerStatusPill>
            <DeepLedgerStatusPill tone="slate">配置版本 {version ?? "-"}</DeepLedgerStatusPill>
          </div>
        )}
      />

      <DashboardErrorNoticeV1 title="设置操作失败" description={error} />
      <DashboardSuccessNoticeV1 title="设置已更新" description={hint} />

      <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-[104px] xl:self-start">
          <div className="overflow-hidden rounded-[20px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(24,34,54,0.96),rgba(13,19,32,0.98))] shadow-[0_20px_50px_rgba(0,0,0,0.28)]">
            <div className="border-b border-[var(--border)] px-5 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">配置导航</div>
              <div className="mt-2 text-sm leading-6 text-[var(--muted)]">二级导航帮助你在长表单中快速定位模块，并明确当前修改范围。</div>
            </div>
            <div className="space-y-2 px-3 py-3">
              {SETTINGS_NAV_ITEMS_V1.map((item, index) => (
                <div key={item.id} className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.38)] p-2">
                  <DeepLedgerSectionAnchor
                    href={`#settings-${item.id}`}
                    active={activeSection === item.id}
                    label={item.label}
                    onClick={() => setActiveSection(item.id)}
                  />
                  <div className="px-3 pb-2 pt-1 text-xs leading-5 text-[var(--faint)]">{item.desc}</div>
                  {index < SETTINGS_NAV_ITEMS_V1.length - 1 ? <div className="mx-2 mt-2 border-t border-dashed border-[var(--border)]" /> : null}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <div className="space-y-5">
          <SettingsStrategySectionV1 config={config} setConfig={setConfig} />
          <SettingsRiskSectionV1 config={config} setConfig={setConfig} />
          <SettingsDataSourcesSectionV1 config={config} setConfig={setConfig} />
          <SettingsHumanFactorSectionV1 config={config} setConfig={setConfig} />
          <SettingsNotificationSectionV1 config={config} setConfig={setConfig} />
        </div>
      </div>

      <div className="sticky bottom-4 z-20">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 rounded-[20px] border border-[var(--border)] bg-[rgba(8,12,20,0.9)] px-5 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-[var(--text)]">配置保存条</div>
            <div className="mt-1 text-sm text-[var(--muted)]">
              {isDirty ? "你有未保存的修改，建议在离开页面前统一保存。" : "当前页面没有待保存的修改。"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void saveConfig()}
            disabled={saving || !isDirty}
            className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-[var(--bg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[var(--elevated)] disabled:text-[var(--muted)] disabled:opacity-70"
          >
            <Save className="h-4 w-4" />
            {saving ? "保存中…" : isDirty ? "保存全部设置" : "已全部保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
