"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, RefreshCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { formatDateTime } from "@/app/daa/dashboard/_components/daaFormatters";
import { emitDashboardDataUpdated, emitDashboardRefresh } from "@/app/daa/dashboard/dashboardEvents";
import { DashboardEmptyState, DashboardErrorNotice, DashboardSuccessNotice } from "@/app/daa/dashboard/_components/DashboardFeedback";
import { DaaSurfaceActionButton, DaaSurfacePageHeader, DaaSurfaceStatusPill } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { DataHealthPanel } from "@/app/daa/dashboard/settings/_components/DataHealthPanel";
import { SettingsBrainSection } from "@/app/daa/dashboard/settings/_components/SettingsBrainSection";
import { SettingsDataSourcesSection } from "@/app/daa/dashboard/settings/_components/SettingsDataSourcesSection";
import {
  SETTINGS_NAV_ITEMS_,
  type SettingsNavItemId,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";
import { SettingsNotificationSection } from "@/app/daa/dashboard/settings/_components/SettingsNotificationSection";
import { SettingsRiskSection } from "@/app/daa/dashboard/settings/_components/SettingsRiskSection";
import { SettingsDataInitSection } from "@/app/daa/dashboard/settings/_components/SettingsDataInitSection";
import { SettingsSecretsSection } from "@/app/daa/dashboard/settings/_components/SettingsSecretsSection";
import { SettingsStrategySection } from "@/app/daa/dashboard/settings/_components/SettingsStrategySection";
import { ApiClientError } from "@/src/daa/api/client";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import { getWorkbenchReadModel } from "@/src/daa/modules/read/readApi";
import { getSystemConfig, refreshMarketIndicators, saveSystemConfig } from "@/src/daa/modules/store/storeApi";

const SETTINGS_PAGE_DESCRIPTION_ = "集中管理大脑授权、策略、数据、通知与凭证，建议按分区逐步修改并统一保存。";

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

function SettingsSectionGroup(props: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { title, description, children } = props;

  return (
    <section className="space-y-4">
      <div className="rounded-[20px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(17,23,38,0.92),rgba(9,13,24,0.98))] px-5 py-5 shadow-[0_16px_40px_rgba(0,0,0,0.16)]">
        <div className="text-lg font-semibold text-[var(--text)]">{title}</div>
        <div className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{description}</div>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const [version, setVersion] = useState<number | null>(null);
  const [config, setConfig] = useState<DaaSystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [baselineConfig, setBaselineConfig] = useState<DaaSystemConfig | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsNavItemId>("strategy");
  const [marketRefreshing, setMarketRefreshing] = useState(false);
  const [dataHealthAssets, setDataHealthAssets] = useState<
    { assetKey: string; symbol: string; market: string; priceStatus: "fresh" | "stale" | "missing" | "unsupported"; priceUpdatedAt: string | null; priceAgeSec: number | null }[]
  >([]);

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

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void getWorkbenchReadModel({ syncPrices: false }).then((wb) => {
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
    }).catch(() => {
      /* 静默失败 — 数据质量面板非关键 */
    });
  }, []);

  const isDirty = useMemo(() => {
    if (!config || !baselineConfig) return false;
    return stableStringify(config) !== stableStringify(baselineConfig);
  }, [baselineConfig, config]);

  /** Per-section dirty detection for nav indicator dots */
  const sectionDirtyMap = useMemo<Record<SettingsNavItemId, boolean>>(() => {
    if (!config || !baselineConfig) return { strategy: false, brain: false, data: false, notification: false, secrets: false };
    const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
    return {
      strategy: changed(config.rebalanceStrategy, baselineConfig.rebalanceStrategy)
        || changed(config.strategy?.risk, baselineConfig.strategy?.risk)
        || changed(config.strategy?.constraints, baselineConfig.strategy?.constraints)
        || changed(config.strategy?.execution, baselineConfig.strategy?.execution),
      brain: changed(config.brain, baselineConfig.brain)
        || changed(config.cognitiveAgent, baselineConfig.cognitiveAgent),
      data: changed(config.dataSources, baselineConfig.dataSources),
      notification: changed(config.notification, baselineConfig.notification),
      secrets: false, // secrets managed separately
    };
  }, [baselineConfig, config]);

  const dirtySectionCount = useMemo(
    () => Object.values(sectionDirtyMap).filter(Boolean).length,
    [sectionDirtyMap],
  );

  const dataHealthSummary = useMemo(() => {
    if (dataHealthAssets.length === 0) {
      return { healthyCount: 0, attentionCount: 0, label: "尚未载入行情健康状态" };
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

  if (loading) {
    return (
      <div className="space-y-6 lg:space-y-7">
        <DaaSurfacePageHeader eyebrow="系统控制" title="设置" description={SETTINGS_PAGE_DESCRIPTION_} />
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
          description={SETTINGS_PAGE_DESCRIPTION_}
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
        description={SETTINGS_PAGE_DESCRIPTION_}
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
          <div>
            <div className="text-sm font-semibold text-[var(--text)]">设置分组</div>
            <div className="mt-1 text-sm text-[var(--muted)]">
              先改策略，再核对数据模型，最后检查通知和凭证。
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-[var(--muted)]">
            <BellRing className="h-4 w-4 text-[var(--faint)]" />
            {dataHealthSummary.label}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {SETTINGS_NAV_ITEMS_.map((item) => (
            <a
              key={item.id}
              href={`#settings-${item.id}`}
              onClick={() => setActiveSection(item.id)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors ${
                activeSection === item.id
                  ? "border-[var(--primary)] bg-[rgba(56,189,248,0.12)] text-[var(--text)]"
                  : "border-[var(--border)] bg-[rgba(255,255,255,0.03)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
              }`}
            >
              <span>{item.label}</span>
              {sectionDirtyMap[item.id] ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--amber)]" /> : null}
            </a>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        <SettingsSectionGroup
          title="基础策略"
          description="先定义系统何时行动、怎样控制风险。这部分是整套配置里最常改、也最影响结果的一组。"
        >
          <SettingsStrategySection config={config} setConfig={setConfig} />
          <SettingsRiskSection config={config} setConfig={setConfig} />
        </SettingsSectionGroup>

        <SettingsSectionGroup
          title="大脑与自动化"
          description="这里定义 AI 是顾问、操作员还是自动驾驶。我们把认知循环、授权边界和配置落地策略放在一起，避免“大脑”和“手”继续割裂。"
        >
          <SettingsBrainSection config={config} setConfig={setConfig} />
        </SettingsSectionGroup>

        <SettingsSectionGroup
          title="数据与模型"
          description="这里管理行情、资讯、汇率和 AI 模型输入。先确认源是否启用，再处理健康检查和初始化。"
        >
          <SettingsDataSourcesSection config={config} setConfig={setConfig} />
          {dataHealthAssets.length > 0 ? <DataHealthPanel assets={dataHealthAssets} /> : null}
          <SettingsDataInitSection />
        </SettingsSectionGroup>

        <SettingsSectionGroup
          title="通知"
          description="通知单独成组，便于把运行提醒与策略参数区分开，减少把执行状态和表单配置混在一起的误判。"
        >
          <SettingsNotificationSection config={config} setConfig={setConfig} />
        </SettingsSectionGroup>

        <SettingsSectionGroup
          title="凭证与连接"
          description="最后处理密钥、Webhook 与外部服务连接。保存后建议回到通知或数据区验证是否真正生效。"
        >
          <SettingsSecretsSection />
        </SettingsSectionGroup>
      </div>

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
