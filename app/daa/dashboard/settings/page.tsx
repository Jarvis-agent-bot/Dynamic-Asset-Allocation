"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, RefreshCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { formatDateTime } from "@/app/daa/dashboard/_components/daaFormatters";
import { emitWorkbenchDataUpdated, emitWorkbenchRefresh } from "@/app/daa/dashboard/workbenchEvents";
import { WorkbenchEmptyState, WorkbenchErrorNotice, WorkbenchSuccessNotice } from "@/app/daa/dashboard/_components/WorkbenchFeedback";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import { DaaSurfaceActionButton, DaaSurfacePageHeader, DaaSurfaceStatusPill } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import {
  SETTINGS_NAV_ITEMS,
  type SettingsNavItemId,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";
import { useSettingsDirty } from "@/app/daa/dashboard/settings/_components/useSettingsDirty";
import { SettingsAssistantAutomationTab } from "@/app/daa/dashboard/settings/_components/tabs/SettingsAssistantAutomationTab";
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
} from "@/src/daa/modules/store/workbenchStoreApiClient";

function resolveSectionFromHash(hash: string): SettingsNavItemId | null {
  const id = hash.replace(/^#settings-/, "").trim();
  if (id === "secrets") return "data";
  const matched = SETTINGS_NAV_ITEMS.find((item) => item.id === id);
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
      const systemConfigResponse = await getSystemConfig();
      setVersion(systemConfigResponse.version);
      setConfig(systemConfigResponse.config);
      setBaselineConfig(systemConfigResponse.config);
    } catch (error) {
      setError(error instanceof Error ? error.message : "加载设置失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshDataHealthAssets = useCallback(async () => {
    try {
      const workbenchModel = await getWorkbenchReadModel({ syncPrices: false });
      setDataHealthAssets(
        workbenchModel.bootstrap.assetUniverse.map((assetRow) => ({
          assetKey: assetRow.assetKey,
          symbol: assetRow.symbol,
          market: assetRow.market,
          priceStatus: assetRow.priceStatus,
          priceUpdatedAt: assetRow.priceUpdatedAt,
          priceAgeSec: assetRow.priceAgeSec,
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

  // 拦截站内 SPA 导航（侧边栏等 <Link>），未保存时二次确认，避免静默丢弃改动。
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || anchor.target === "_blank") return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      if (!window.confirm("有未保存的设置修改，确定离开？未保存的修改将丢失。")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
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
    if (saving) return false; // 防止重入导致并发保存
    setSaving(true);
    setError("");
    setHint("");
    try {
      const saved = await saveSystemConfig({ config, baseVersion: version });
      setVersion(saved.version);
      setConfig(saved.config);
      setBaselineConfig(saved.config);
      setHint(`保存成功 ${formatDateTime(saved.updatedAt)}；已生成的再平衡周期需重新生成/刷新建议后才会应用新配置`);
      emitWorkbenchDataUpdated();
      return true;
    } catch (error) {
      if (error instanceof ApiClientError && (error.status === 409 || error.code === "VERSION_CONFLICT")) {
        const latestVersion = typeof error.details === "object" && error.details && "latestVersion" in (error.details as Record<string, unknown>)
          ? Number((error.details as Record<string, unknown>).latestVersion)
          : Number.NaN;
        if (typeof latestVersion === "number" && latestVersion > 0) {
          setError(`配置已被其他操作更新，请刷新后重试（最新版本 ${Math.trunc(latestVersion)}）`);
        } else {
          toast.error("配置已被其他操作更新，请刷新页面重试。");
          setError("配置已被其他操作更新，请刷新后重试");
        }
        return false;
      }
      setError(error instanceof Error ? error.message : "保存失败");
      return false;
    } finally {
      setSaving(false);
    }
  }, [config, version, saving]);

  const handleRefreshMarketContext = useCallback(async () => {
    if (marketRefreshing) return;
    setMarketRefreshing(true);
    setError("");
    try {
      const result = await refreshMarketIndicators();
      const message = `市场状态层已刷新，更新 ${result.refreshedCount} 项指标`;
      setHint(message);
      toast.success(message);
      emitWorkbenchRefresh({ source: "settings_market_refresh" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "刷新市场状态层失败";
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
      return <SettingsAssistantAutomationTab config={config} setConfig={setConfig} />;
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
      <div className="space-y-4">
        <DaaSurfacePageHeader eyebrow="系统控制" title="设置" />
        <WorkbenchEmptyState title="正在加载设置…" description="同步配置与市场状态。" className="px-4 py-4" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="space-y-4">
        <DaaSurfacePageHeader
          eyebrow="系统控制"
          title="设置"
          actions={(
            <DaaSurfaceActionButton tone="primary" className="h-9 rounded-[var(--radius-sm)] px-4 text-xs" onClick={() => void load()}>
              <RefreshCcw className="h-3.5 w-3.5" />
              重新加载设置
            </DaaSurfaceActionButton>
          )}
        />
        <WorkbenchErrorNotice title="设置加载失败" description={error || "设置服务暂时不可用，请稍后重试。"} />
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-5">
      <DaaSurfacePageHeader
        eyebrow="系统控制"
        title="设置"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {isDirty ? (
              <DaaSurfaceActionButton
                tone="primary"
                className="h-9 rounded-[var(--radius-sm)] px-4 text-xs"
                onClick={() => void saveConfig()}
                disabled={loading || saving}
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? "保存中…" : "保存设置"}
              </DaaSurfaceActionButton>
            ) : null}
            <DaaSurfaceActionButton
              tone="neutral"
              className="h-9 rounded-[var(--radius-sm)] px-4 text-xs"
              onClick={() => void handleRefreshMarketContext()}
              disabled={loading || saving || marketRefreshing}
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${marketRefreshing ? "animate-spin" : ""}`} />
              {marketRefreshing ? "刷新市场中…" : "刷新市场状态层"}
            </DaaSurfaceActionButton>
            <DaaSurfaceStatusPill tone={isDirty ? "warning" : "success"}>{isDirty ? "存在未保存修改" : "已与当前版本同步"}</DaaSurfaceStatusPill>
            <DaaSurfaceStatusPill tone="neutral">配置版本 {version ?? "-"}</DaaSurfaceStatusPill>
          </div>
        )}
      />

      <WorkbenchErrorNotice title="设置操作失败" description={error} />
      <WorkbenchSuccessNotice title="设置已更新" description={hint} />

      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {SETTINGS_NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSectionChange(item.id)}
                className={`inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-1.5 text-sm transition-colors ${
                  activeSection === item.id
                    ? "border-[var(--primary)] bg-[var(--primary-bg)] text-[var(--text)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                }`}
              >
                <span>{item.label}</span>
                {sectionDirtyMap[item.id] ? (
                  <span className="border-l border-[var(--amber-border)] pl-2 text-[10px] font-medium text-[var(--amber)]">未保存</span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--muted)]">
            <BellRing className="h-4 w-4 text-[var(--faint)]" />
            {dataHealthSummary.label}
          </div>
        </div>
      </div>

      <SectionErrorBoundary sectionName="设置">
        {activeContent}
      </SectionErrorBoundary>
    </div>
  );
}
