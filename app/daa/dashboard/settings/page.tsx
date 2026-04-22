"use client";

import type { ComponentType, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, BellRing, Bot, KeyRound, RefreshCcw, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { formatDateTime } from "@/app/daa/dashboard/_components/daaFormatters";
import { emitDashboardDataUpdated, emitDashboardRefresh } from "@/app/daa/dashboard/dashboardEvents";
import { DashboardEmptyState, DashboardErrorNotice, DashboardSuccessNotice } from "@/app/daa/dashboard/_components/DashboardFeedback";
import { DaaSurfaceActionButton, DaaSurfacePageHeader, DaaSurfaceSectionAnchor, DaaSurfaceStatusPill } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { DataHealthPanel } from "@/app/daa/dashboard/settings/_components/DataHealthPanel";
import { SettingsDataSourcesSection } from "@/app/daa/dashboard/settings/_components/SettingsDataSourcesSection";
import {
  SETTINGS_NAV_GROUPS_,
  SETTINGS_NAV_ITEMS_,
  type SettingsNavItemId,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";
import { SettingsHumanFactorSection } from "@/app/daa/dashboard/settings/_components/SettingsHumanFactorSection";
import { SettingsNotificationSection } from "@/app/daa/dashboard/settings/_components/SettingsNotificationSection";
import { SettingsRiskSection } from "@/app/daa/dashboard/settings/_components/SettingsRiskSection";
import { SettingsDataInitSection } from "@/app/daa/dashboard/settings/_components/SettingsDataInitSection";
import { SettingsSecretsSection } from "@/app/daa/dashboard/settings/_components/SettingsSecretsSection";
import { SettingsStrategySection } from "@/app/daa/dashboard/settings/_components/SettingsStrategySection";
import { SettingsAgentSection } from "@/app/daa/dashboard/settings/_components/SettingsAgentSection";
import { ApiClientError } from "@/src/daa/api/client";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import { getWorkbenchReadModel } from "@/src/daa/modules/read/readApi";
import { getSystemConfig, refreshMarketIndicators, saveSystemConfig } from "@/src/daa/modules/store/storeApi";

const SETTINGS_PAGE_DESCRIPTION_ = "按职责配置再平衡策略、风控参数、数据源、人因与通知，并通过固定保存条统一提交。";

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

function SettingsOverviewCard(props: {
  eyebrow: string;
  title: string;
  detail: string;
  accent: "cyan" | "amber" | "green" | "violet";
  icon: ComponentType<{ className?: string }>;
}) {
  const { eyebrow, title, detail, accent, icon: Icon } = props;
  const accentMap = {
    cyan: "rgba(56,189,248,0.18)",
    amber: "rgba(251,191,36,0.18)",
    green: "rgba(74,222,128,0.18)",
    violet: "rgba(167,139,250,0.18)",
  } as const;

  return (
    <div
      className="rounded-[20px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(18,25,40,0.9),rgba(9,13,24,0.98))] p-4 shadow-[0_18px_45px_rgba(0,0,0,0.18)]"
      style={{ boxShadow: `inset 0 1px 0 ${accentMap[accent]}, 0 18px 45px rgba(0,0,0,0.18)` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">{eyebrow}</div>
          <div className="mt-2 text-lg font-semibold text-[var(--text)]">{title}</div>
        </div>
        <div className="rounded-full border border-[var(--border)] bg-[rgba(255,255,255,0.04)] p-2.5">
          <Icon className="h-4 w-4 text-[var(--text)]" />
        </div>
      </div>
      <div className="mt-3 text-sm leading-6 text-[var(--muted)]">{detail}</div>
    </div>
  );
}

function SettingsSectionGroup(props: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { eyebrow, title, description, children } = props;

  return (
    <section className="space-y-4">
      <div className="rounded-[22px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(17,23,38,0.94),rgba(9,13,24,0.98))] px-5 py-5 shadow-[0_18px_48px_rgba(0,0,0,0.18)]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">{eyebrow}</div>
        <div className="mt-2 text-xl font-semibold text-[var(--text)]">{title}</div>
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
    if (!config || !baselineConfig) return { strategy: false, risk: false, data: false, "human-factor": false, notification: false, secrets: false, agent: false };
    const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
    return {
      strategy: changed(config.rebalanceStrategy, baselineConfig.rebalanceStrategy),
      risk: changed(config.strategy?.risk, baselineConfig.strategy?.risk) || changed(config.strategy?.constraints, baselineConfig.strategy?.constraints),
      data: changed(config.dataSources, baselineConfig.dataSources),
      "human-factor": changed(config.strategy?.targetWeights, baselineConfig.strategy?.targetWeights) ,
      notification: changed(config.notification, baselineConfig.notification),
      secrets: false, // secrets managed separately
      agent: changed(config.cognitiveAgent, baselineConfig.cognitiveAgent),
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

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <SettingsOverviewCard
          eyebrow="保存状态"
          title={isDirty ? `待保存 ${dirtySectionCount} 个模块` : "配置已同步"}
          detail={isDirty ? "当前页面存在改动，建议统一保存后再离开。" : "当前表单与服务器版本保持一致。"}
          accent={isDirty ? "amber" : "green"}
          icon={ShieldCheck}
        />
        <SettingsOverviewCard
          eyebrow="运行版本"
          title={`配置版本 ${version ?? "-"}`}
          detail="所有表单都会合并进同一份系统配置，版本号能帮助排查并发改动。"
          accent="cyan"
          icon={Activity}
        />
        <SettingsOverviewCard
          eyebrow="行情健康"
          title={dataHealthAssets.length > 0 ? `${dataHealthSummary.healthyCount}/${dataHealthAssets.length} 正常` : "等待健康检查"}
          detail={dataHealthSummary.label}
          accent={dataHealthSummary.attentionCount > 0 ? "amber" : "green"}
          icon={BellRing}
        />
        <SettingsOverviewCard
          eyebrow="认知链路"
          title={config.cognitiveAgent?.enabled ? "Agent 已启用" : "Agent 关闭"}
          detail={config.dataSources.llmAnalysis.enabled ? "AI 解读链路已打开，可进一步配置多模型。" : "AI 解读当前关闭，部分解释链路会降级。"}
          accent="violet"
          icon={Bot}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-[104px] xl:self-start">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-[22px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(24,34,54,0.96),rgba(13,19,32,0.98))] shadow-[0_24px_60px_rgba(0,0,0,0.24)]">
              <div className="border-b border-[var(--border)] px-5 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">导航与状态</div>
                <div className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  左侧看整体，右侧改细节。优先按模块分批保存，能减少一次改太多带来的误判。
                </div>
              </div>
              <div className="grid gap-2 border-b border-[var(--border)] px-4 py-4">
                <div className="flex items-center justify-between rounded-[16px] border border-[var(--border)] bg-[rgba(255,255,255,0.03)] px-3 py-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">未保存模块</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--text)]">{dirtySectionCount} 个</div>
                  </div>
                  <ShieldCheck className="h-4 w-4 text-[var(--text)]" />
                </div>
                <div className="flex items-center justify-between rounded-[16px] border border-[var(--border)] bg-[rgba(255,255,255,0.03)] px-3 py-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--faint)]">行情健康</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--text)]">{dataHealthSummary.label}</div>
                  </div>
                  <BellRing className="h-4 w-4 text-[var(--text)]" />
                </div>
              </div>
              <div className="space-y-3 px-3 py-3">
                {SETTINGS_NAV_GROUPS_.map((group) => (
                  <div key={group.id} className="rounded-[18px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] p-2.5">
                    <div className="px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">{group.label}</div>
                      <div className="mt-1 text-xs leading-5 text-[var(--muted)]">{group.desc}</div>
                    </div>
                    <div className="space-y-1">
                      {group.items.map((itemId) => {
                        const item = SETTINGS_NAV_ITEMS_.find((entry) => entry.id === itemId);
                        if (!item) return null;

                        return (
                          <div key={item.id} className="rounded-[14px] border border-transparent bg-[rgba(255,255,255,0.015)] p-1.5">
                            <DaaSurfaceSectionAnchor
                              href={`#settings-${item.id}`}
                              active={activeSection === item.id}
                              label={
                                <>
                                  {item.label}
                                  {sectionDirtyMap[item.id] ? (
                                    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--amber)]" title="存在未保存修改" />
                                  ) : null}
                                </>
                              }
                              onClick={() => setActiveSection(item.id)}
                            />
                            <div className="px-3 pb-2 pt-1 text-xs leading-5 text-[var(--faint)]">{item.desc}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[22px] border border-[var(--border)] bg-[rgba(8,12,20,0.68)] px-5 py-4 shadow-[0_14px_40px_rgba(0,0,0,0.16)]">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">
                <KeyRound className="h-3.5 w-3.5" />
                排版建议
              </div>
              <div className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
                <div>先改“策略控制”，再处理通知与凭证，最后再调 Agent，路径会更清楚。</div>
                <div>高频修改项放前面，低频但高风险配置放后面，减少滚动疲劳。</div>
                <div>像“刷新市场状态层”这种运行动作，和“保存表单”分开看会更稳。</div>
              </div>
            </div>
          </div>
        </aside>

        <div className="space-y-6">
          <SettingsSectionGroup
            eyebrow="策略控制"
            title="核心行为与输入"
            description="这一组决定系统怎么判断市场、何时触发动作，以及解释层依赖哪些外部输入。建议先改这里，再看通知和凭证。"
          >
            <SettingsStrategySection config={config} setConfig={setConfig} />
            <SettingsRiskSection config={config} setConfig={setConfig} />
            <SettingsDataSourcesSection config={config} setConfig={setConfig} />
            {dataHealthAssets.length > 0 ? <DataHealthPanel assets={dataHealthAssets} /> : null}
            <SettingsDataInitSection />
            <SettingsHumanFactorSection config={config} setConfig={setConfig} />
          </SettingsSectionGroup>

          <SettingsSectionGroup
            eyebrow="运行协同"
            title="通知与运行状态"
            description="这里关注的是链路是否真正生效。通知、触发和最近一次运行结果放在一起，能帮助更快判断问题出在配置还是执行。"
          >
            <SettingsNotificationSection config={config} setConfig={setConfig} />
          </SettingsSectionGroup>

          <SettingsSectionGroup
            eyebrow="安全访问"
            title="凭证与来源优先级"
            description="密钥、Webhook 与外部来源优先级统一放在这里。调完后回到上面的运行协同区验证，而不是只看是否保存成功。"
          >
            <SettingsSecretsSection />
          </SettingsSectionGroup>

          <SettingsSectionGroup
            eyebrow="认知系统"
            title="Agent 运行配置"
            description="如果前面的输入和通知都稳定了，再来细调 Agent 的调查频率、复盘节奏和熔断逻辑，维护成本会低很多。"
          >
            <SettingsAgentSection config={config} setConfig={setConfig} />
          </SettingsSectionGroup>
        </div>
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
