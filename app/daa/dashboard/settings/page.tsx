"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, RefreshCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { formatDateTime } from "@/app/daa/dashboard/_components/daaFormatters";
import { emitDashboardDataUpdated, emitDashboardRefresh } from "@/app/daa/dashboard/dashboardEvents";
import { DashboardEmptyState, DashboardErrorNotice, DashboardSuccessNotice } from "@/app/daa/dashboard/_components/DashboardFeedback";
import { DaaSurfaceActionButton, DaaSurfacePageHeader, DaaSurfaceStatusPill } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import {
  SETTINGS_NAV_ITEMS_,
  type SettingsNavItemId,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";
import { useSettingsDirty } from "@/app/daa/dashboard/settings/_components/useSettingsDirty";
import { SettingsBrainTab } from "@/app/daa/dashboard/settings/_components/tabs/SettingsBrainTab";
import { SettingsDataTab, type SettingsDataHealthAsset } from "@/app/daa/dashboard/settings/_components/tabs/SettingsDataTab";
import { SettingsNotificationTab } from "@/app/daa/dashboard/settings/_components/tabs/SettingsNotificationTab";
import { SettingsStrategyTab } from "@/app/daa/dashboard/settings/_components/tabs/SettingsStrategyTab";
import { ApiClientError } from "@/src/daa/api/client";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import { getWorkbenchReadModel } from "@/src/daa/modules/read/readApi";
import {
  getSystemConfig,
  listExternalRequestLogs,
  refreshMarketIndicators,
  saveSystemConfig,
  type StoreExternalRequestLogsResult,
} from "@/src/daa/modules/store/dashboardStoreApiClient";

function resolveSectionFromHash(hash: string): SettingsNavItemId | null {
  const id = hash.replace(/^#settings-/, "").trim();
  if (id === "secrets") return "data";
  const matched = SETTINGS_NAV_ITEMS_.find((item) => item.id === id);
  return matched?.id ?? null;
}

export default function SettingsPage() {
  const [version, setVersion] = useState<number | null>(null);
  const [config, setConfig] = useState<DaaSystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [baselineConfig, setBaselineConfig] = useState<DaaSystemConfig | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsNavItemId>(() => (
    typeof window === "undefined" ? "strategy" : (resolveSectionFromHash(window.location.hash) ?? "strategy")
  ));
  const [marketRefreshing, setMarketRefreshing] = useState(false);
  const [dataHealthAssets, setDataHealthAssets] = useState<SettingsDataHealthAsset[]>([]);
  const [externalHealth, setExternalHealth] = useState<StoreExternalRequestLogsResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getSystemConfig();
      setVersion(res.version);
      setConfig(res.config);
      setBaselineConfig(res.config);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载设置失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshDataHealthAssets = useCallback(async () => {
    try {
      const wb = await getWorkbenchReadModel({ syncPrices: false });
      setDataHealthAssets(
        wb.bootstrap.assetUniverse.map((a) => ({
          assetKey: a.assetKey,
          symbol: a.symbol,
          market: a.market,
          priceStatus: a.priceStatus,
          priceUpdatedAt: a.priceUpdatedAt,
          priceAgeSec: a.priceAgeSec,
        })),
      );
    } catch {
      /* 静默失败 — 数据质量面板非关键 */
    }
    try {
      setExternalHealth(await listExternalRequestLogs({ sinceHours: 24, limit: 60 }));
    } catch {
      /* 静默失败 — 外部源健康面板非关键 */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const syncFromHash = () => {
      const section = resolveSectionFromHash(window.location.hash);
      if (section) setActiveSection(section);
    };

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    window.addEventListener("popstate", syncFromHash);
    return () => {
      window.removeEventListener("hashchange", syncFromHash);
      window.removeEventListener("popstate", syncFromHash);
    };
  }, []);

  useEffect(() => {
    if (activeSection !== "data") return;
    void refreshDataHealthAssets();
  }, [activeSection, refreshDataHealthAssets]);

  const { isDirty, sectionDirtyMap } = useSettingsDirty(config, baselineConfig);

  // 离开页面前提醒未保存改动
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const dataHealthSummary = useMemo(() => {
    if (dataHealthAssets.length === 0) {
      return { healthyCount: 0, attentionCount: 0, label: "切换到数据页后同步行情健康状态" };
    }

    const healthyCount = dataHealthAssets.filter((asset) => asset.priceStatus === "fresh").length;
    const attentionCount = dataHealthAssets.length - healthyCount;

    return {
      healthyCount,
      attentionCount,
      label: attentionCount > 0 ? `${attentionCount} 个资产需要关注` : "行情健康状态正常",
    };
  }, [dataHealthAssets]);

  const saveConfig = useCallback(async (): Promise<boolean> => {
    if (!config || version == null) return false;
    setSaving(true);
    setError("");
    setHint("");
    try {
      const saved = await saveSystemConfig({ config, baseVersion: version });
      setVersion(saved.version);
      setConfig(saved.config);
      setBaselineConfig(saved.config);
      setHint(`保存成功 ${formatDateTime(saved.updatedAt)}；已生成的再平衡周期需重新生成/刷新建议后才会应用新配置`);
      toast.message("设置已保存；请重新生成或刷新建议，使新配置应用到当前再平衡周期。");
      emitDashboardDataUpdated();
      return true;
    } catch (e) {
      if (e instanceof ApiClientError && (e.status === 409 || e.code === "VERSION_CONFLICT")) {
        const latestVersion = typeof e.details === "object" && e.details && "latestVersion" in (e.details as Record<string, unknown>)
          ? Number((e.details as Record<string, unknown>).latestVersion)
          : Number.NaN;
        if (typeof latestVersion === "number" && latestVersion > 0) {
          setError(`配置已被其他操作更新，请刷新后重试（最新版本 ${Math.trunc(latestVersion)}）`);
        } else {
          toast.error("配置版本冲突，请刷新页面重试。");
          setError("配置已被其他操作更新，请刷新后重试");
        }
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
    setMarketRefreshing(true);
    setError("");
    try {
      const result = await refreshMarketIndicators();
      const message = `市场状态层已刷新，更新 ${result.refreshedCount} 项指标`;
      setHint(message);
      toast.success(message);
      emitDashboardRefresh({ source: "settings_market_refresh" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "刷新市场状态层失败";
      setError(message);
      toast.error(message);
    } finally {
      setMarketRefreshing(false);
    }
  }, [marketRefreshing]);

  const handleSectionChange = useCallback((section: SettingsNavItemId) => {
    setActiveSection(section);
    window.history.pushState(null, "", `#settings-${section}`);
  }, []);

  const activeContent = useMemo(() => {
    if (!config) return null;
    if (activeSection === "brain") {
      return <SettingsBrainTab config={config} setConfig={setConfig} />;
    }
    if (activeSection === "data") {
      return (
        <SettingsDataTab
          config={config}
          setConfig={setConfig}
          dataHealthAssets={dataHealthAssets}
          externalHealth={externalHealth}
        />
      );
    }
    if (activeSection === "notification") {
      return <SettingsNotificationTab config={config} setConfig={setConfig} />;
    }
    return <SettingsStrategyTab config={config} setConfig={setConfig} />;
  }, [activeSection, config, dataHealthAssets, externalHealth]);

  if (loading) {
    return (
      <div className="space-y-6 lg:space-y-7">
        <DaaSurfacePageHeader eyebrow="系统控制" title="设置" />
        <DashboardEmptyState title="正在加载设置…" description="正在同步最新配置与市场状态层，请稍候。" className="px-5 py-16" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="space-y-6 lg:space-y-7">
        <DaaSurfacePageHeader
          eyebrow="系统控制"
          title="设置"
          actions={(
            <DaaSurfaceActionButton tone="primary" className="h-9 rounded-full px-4 text-xs" onClick={() => void load()}>
              <RefreshCcw className="h-3.5 w-3.5" />
              重新加载设置
            </DaaSurfaceActionButton>
          )}
        />
        <DashboardErrorNotice title="设置加载失败" description={error || "设置服务暂时不可用，请稍后重试。"} />
      </div>
    );
  }

  return (
    <div className="space-y-6 lg:space-y-7">
      <DaaSurfacePageHeader
        eyebrow="系统控制"
        title="设置"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {isDirty ? (
              <DaaSurfaceActionButton
                tone="primary"
                className="h-9 rounded-full px-4 text-xs"
                onClick={() => void saveConfig()}
                disabled={loading || saving}
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? "保存中…" : "保存设置"}
              </DaaSurfaceActionButton>
            ) : null}
            <DaaSurfaceActionButton
              tone="slate"
              className="h-9 rounded-full px-4 text-xs"
              onClick={() => void handleRefreshMarketContext()}
              disabled={loading || saving || marketRefreshing}
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${marketRefreshing ? "animate-spin" : ""}`} />
              {marketRefreshing ? "刷新市场中…" : "刷新市场状态层"}
            </DaaSurfaceActionButton>
            <DaaSurfaceStatusPill tone={isDirty ? "amber" : "green"}>{isDirty ? "存在未保存修改" : "已与当前版本同步"}</DaaSurfaceStatusPill>
            <DaaSurfaceStatusPill tone="slate">配置版本 {version ?? "-"}</DaaSurfaceStatusPill>
          </div>
        )}
      />

      <DashboardErrorNotice title="设置操作失败" description={error} />
      <DashboardSuccessNotice title="设置已更新" description={hint} />

      <div className="rounded-[18px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(17,23,38,0.92),var(--surface))] px-5 py-4 shadow-[0_16px_40px_rgba(0,0,0,0.16)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {SETTINGS_NAV_ITEMS_.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSectionChange(item.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors ${
                  activeSection === item.id
                    ? "border-[var(--primary)] bg-[var(--primary-bg)] text-[var(--text)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                }`}
              >
                <span>{item.label}</span>
                {sectionDirtyMap[item.id] ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--amber)]" /> : null}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)]">
            <BellRing className="h-4 w-4 text-[var(--faint)]" />
            {dataHealthSummary.label}
          </div>
        </div>
      </div>

      {activeContent}
    </div>
  );
}
