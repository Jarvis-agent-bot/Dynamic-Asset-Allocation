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
import { SettingsBrainTab } from "@/app/daa/dashboard/settings/_components/tabs/SettingsBrainTab";
import { SettingsDataTab, type SettingsDataHealthAsset } from "@/app/daa/dashboard/settings/_components/tabs/SettingsDataTab";
import { SettingsNotificationTab } from "@/app/daa/dashboard/settings/_components/tabs/SettingsNotificationTab";
import { SettingsStrategyTab } from "@/app/daa/dashboard/settings/_components/tabs/SettingsStrategyTab";
import { ApiClientError } from "@/src/daa/api/client";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import { getWorkbenchReadModel } from "@/src/daa/modules/read/readApi";
import { getSystemConfig, refreshMarketIndicators, saveSystemConfig } from "@/src/daa/modules/store/dashboardStoreApiClient";

function resolveSectionFromHash(hash: string): SettingsNavItemId | null {
  const id = hash.replace(/^#settings-/, "").trim();
  if (id === "secrets") return "data";
  const matched = SETTINGS_NAV_ITEMS_.find((item) => item.id === id);
  return matched?.id ?? null;
}

/** 深度排序后序列化，消除嵌套字段顺序差异导致的误判 */
function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return "";
  return JSON.stringify(obj, (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.keys(value).sort().reduce<Record<string, unknown>>((sorted, k) => {
        sorted[k] = value[k];
        return sorted;
      }, {});
    }
    return value;
  });
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

  const isDirty = useMemo(() => {
    if (!config || !baselineConfig) return false;
    return stableStringify(config) !== stableStringify(baselineConfig);
  }, [baselineConfig, config]);

  /** Per-section dirty detection for nav indicator dots */
  const sectionDirtyMap = useMemo<Record<SettingsNavItemId, boolean>>(() => {
    if (!config || !baselineConfig) return { strategy: false, brain: false, data: false, notification: false };
    const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
    return {
      strategy: changed(config.policy, baselineConfig.policy)
        || changed(config.strategy?.risk, baselineConfig.strategy?.risk)
        || changed(config.strategy?.constraints, baselineConfig.strategy?.constraints)
        || changed(config.strategy?.execution, baselineConfig.strategy?.execution),
      brain: changed(config.brain, baselineConfig.brain)
        || changed(config.cognitiveAgent, baselineConfig.cognitiveAgent),
      data: changed(config.dataSources, baselineConfig.dataSources),
      notification: changed(config.notification, baselineConfig.notification),
    };
  }, [baselineConfig, config]);

  const dirtySectionCount = useMemo(
    () => Object.values(sectionDirtyMap).filter(Boolean).length,
    [sectionDirtyMap],
  );

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
      return <SettingsDataTab config={config} setConfig={setConfig} dataHealthAssets={dataHealthAssets} />;
    }
    if (activeSection === "notification") {
      return <SettingsNotificationTab config={config} setConfig={setConfig} />;
    }
    return <SettingsStrategyTab config={config} setConfig={setConfig} />;
  }, [activeSection, config, dataHealthAssets]);

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

      <div className="rounded-[18px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(17,23,38,0.92),rgba(9,13,24,0.98))] px-5 py-4 shadow-[0_16px_40px_rgba(0,0,0,0.16)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {SETTINGS_NAV_ITEMS_.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSectionChange(item.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors ${
                  activeSection === item.id
                    ? "border-[var(--primary)] bg-[rgba(56,189,248,0.12)] text-[var(--text)]"
                    : "border-[var(--border)] bg-[rgba(255,255,255,0.03)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                }`}
              >
                <span>{item.label}</span>
                {sectionDirtyMap[item.id] ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--amber)]" /> : null}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-[var(--muted)]">
            <BellRing className="h-4 w-4 text-[var(--faint)]" />
            {dataHealthSummary.label}
          </div>
        </div>
      </div>

      {activeContent}

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-[var(--border)] bg-[rgba(8,12,20,0.95)] px-4 py-3 backdrop-blur-xl sm:-mx-5 sm:px-5 lg:-mx-7 lg:px-7">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-[var(--text)]">配置保存条</div>
            <div className="mt-1 text-sm text-[var(--muted)]">
              {isDirty ? `存在 ${dirtySectionCount} 个未保存模块，建议在离开页面前统一保存。` : "当前页面没有待保存的修改。"}
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
