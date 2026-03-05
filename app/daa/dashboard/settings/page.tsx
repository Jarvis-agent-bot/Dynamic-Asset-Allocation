"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Save } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { getSystemConfigV2, saveSystemConfigV2 } from "@/src/daa/modules/store/storeApiV1";
import type { DaaSystemConfigV2 } from "@/src/daa/config/systemConfigV2";

const DAA_DASHBOARD_DATA_UPDATED_EVENT_V1 = "daa:dashboard:data-updated";

function NumberInput(props: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <Input
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

export default function SettingsPage() {
  const [version, setVersion] = useState<number | null>(null);
  const [config, setConfig] = useState<DaaSystemConfigV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getSystemConfigV2();
      setVersion(res.version);
      setConfig(res.config);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载设置失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveConfig() {
    if (!config || version == null) return;
    setSaving(true);
    setError("");
    setHint("");
    try {
      const saved = await saveSystemConfigV2({ config, baseVersion: version });
      setVersion(saved.version);
      setConfig(saved.config);
      setHint(`保存成功 ${new Date(saved.updatedAt).toLocaleTimeString()}`);
      window.dispatchEvent(new CustomEvent(DAA_DASHBOARD_DATA_UPDATED_EVENT_V1, { detail: { ts: Date.now() } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !config) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        设置加载中...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="设置"
        description="按职责配置再平衡策略、风控参数、数据源、人因与通知。"
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>设置操作失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {hint ? (
        <Alert>
          <AlertTitle>提示</AlertTitle>
          <AlertDescription>{hint}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">再平衡策略</CardTitle>
          <CardDescription>支持定期触发和偏移触发，两者可并行启用。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="daa-checkbox"
              checked={config.rebalanceStrategy.calendar.enabled}
              onChange={(e) => setConfig((prev) => prev ? ({
                ...prev,
                rebalanceStrategy: {
                  ...prev.rebalanceStrategy,
                  calendar: { ...prev.rebalanceStrategy.calendar, enabled: e.target.checked },
                },
              }) : prev)}
            />
            启用定期再平衡
          </label>

          <div className="space-y-1.5">
            <Label>定期频率</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={config.rebalanceStrategy.calendar.frequency}
              onChange={(e) => setConfig((prev) => prev ? ({
                ...prev,
                rebalanceStrategy: {
                  ...prev.rebalanceStrategy,
                  calendar: {
                    ...prev.rebalanceStrategy.calendar,
                    frequency: e.target.value as DaaSystemConfigV2["rebalanceStrategy"]["calendar"]["frequency"],
                  },
                },
              }) : prev)}
            >
              <option value="monthly">每月</option>
              <option value="quarterly">每季度</option>
              <option value="semi_annual">每半年</option>
              <option value="annual">每年</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>执行日 (1-28)</Label>
            <NumberInput
              value={config.rebalanceStrategy.calendar.dayOfMonth}
              min={1}
              max={28}
              onChange={(value) => setConfig((prev) => prev ? ({
                ...prev,
                rebalanceStrategy: {
                  ...prev.rebalanceStrategy,
                  calendar: { ...prev.rebalanceStrategy.calendar, dayOfMonth: Math.max(1, Math.min(28, Math.trunc(value || 1))) },
                },
              }) : prev)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="daa-checkbox"
              checked={config.rebalanceStrategy.drift.enabled}
              onChange={(e) => setConfig((prev) => prev ? ({
                ...prev,
                rebalanceStrategy: {
                  ...prev.rebalanceStrategy,
                  drift: { ...prev.rebalanceStrategy.drift, enabled: e.target.checked },
                },
              }) : prev)}
            />
            启用偏移量再平衡
          </label>

          <div className="space-y-1.5">
            <Label>偏移阈值 (%)</Label>
            <NumberInput
              value={config.rebalanceStrategy.drift.thresholdPct * 100}
              min={1}
              max={50}
              step={0.5}
              onChange={(value) => setConfig((prev) => prev ? ({
                ...prev,
                rebalanceStrategy: {
                  ...prev.rebalanceStrategy,
                  drift: { ...prev.rebalanceStrategy.drift, thresholdPct: Math.max(0.01, Math.min(0.5, value / 100)) },
                },
              }) : prev)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>检查频率</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={config.rebalanceStrategy.drift.checkFrequency}
              onChange={(e) => setConfig((prev) => prev ? ({
                ...prev,
                rebalanceStrategy: {
                  ...prev.rebalanceStrategy,
                  drift: { ...prev.rebalanceStrategy.drift, checkFrequency: e.target.value as "daily" | "weekly" },
                },
              }) : prev)}
            >
              <option value="daily">每日</option>
              <option value="weekly">每周</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>冷静期 (小时)</Label>
            <NumberInput
              value={config.rebalanceStrategy.cooldownHours}
              min={1}
              max={720}
              onChange={(value) => setConfig((prev) => prev ? ({
                ...prev,
                rebalanceStrategy: { ...prev.rebalanceStrategy, cooldownHours: Math.max(1, Math.trunc(value || 1)) },
              }) : prev)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>自动分析时间 (UTC)</Label>
            <Input
              value={config.rebalanceStrategy.analysisTimeUtc}
              onChange={(e) => setConfig((prev) => prev ? ({
                ...prev,
                rebalanceStrategy: { ...prev.rebalanceStrategy, analysisTimeUtc: e.target.value },
              }) : prev)}
              placeholder="00:20"
            />
          </div>

          <div className="space-y-1.5">
            <Label>时区</Label>
            <Input
              value={config.rebalanceStrategy.timezone}
              onChange={(e) => setConfig((prev) => prev ? ({
                ...prev,
                rebalanceStrategy: { ...prev.rebalanceStrategy, timezone: e.target.value },
              }) : prev)}
              placeholder="Asia/Shanghai"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="daa-checkbox"
              checked={config.rebalanceStrategy.autoGenerateEnabled}
              onChange={(e) => setConfig((prev) => prev ? ({
                ...prev,
                rebalanceStrategy: { ...prev.rebalanceStrategy, autoGenerateEnabled: e.target.checked },
              }) : prev)}
            />
            自动模式（自动生成建议 + 通知）
          </label>

          <div className="space-y-1.5">
            <Label>通知邮箱</Label>
            <Input
              value={config.rebalanceStrategy.notifyEmailTo}
              onChange={(e) => setConfig((prev) => prev ? ({
                ...prev,
                rebalanceStrategy: { ...prev.rebalanceStrategy, notifyEmailTo: e.target.value.trim() },
              }) : prev)}
              placeholder="name@example.com"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>LLM 分析焦点</Label>
            <Input
              value={config.rebalanceStrategy.analysisFocus}
              onChange={(e) => setConfig((prev) => prev ? ({
                ...prev,
                rebalanceStrategy: { ...prev.rebalanceStrategy, analysisFocus: e.target.value },
              }) : prev)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">风控参数</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label>单一持仓上限 (%)</Label>
            <NumberInput
              value={config.strategy.constraints.maxPositionPct * 100}
              min={1}
              max={100}
              step={0.5}
              onChange={(value) => setConfig((prev) => prev ? ({
                ...prev,
                strategy: {
                  ...prev.strategy,
                  constraints: { ...prev.strategy.constraints, maxPositionPct: Math.max(0.01, Math.min(1, value / 100)) },
                },
              }) : prev)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>单日交易上限 (%)</Label>
            <NumberInput
              value={config.strategy.constraints.maxOrderPctOfNav * 100}
              min={1}
              max={100}
              step={0.5}
              onChange={(value) => setConfig((prev) => prev ? ({
                ...prev,
                strategy: {
                  ...prev.strategy,
                  constraints: { ...prev.strategy.constraints, maxOrderPctOfNav: Math.max(0.01, Math.min(1, value / 100)) },
                },
              }) : prev)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>最小交易金额</Label>
            <NumberInput
              value={config.strategy.constraints.minNotional}
              min={1}
              step={10}
              onChange={(value) => setConfig((prev) => prev ? ({
                ...prev,
                strategy: {
                  ...prev.strategy,
                  constraints: { ...prev.strategy.constraints, minNotional: Math.max(1, value) },
                },
              }) : prev)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>默认手续费 (bps)</Label>
            <NumberInput
              value={config.strategy.constraints.tradeFeeRateBps ?? 5}
              min={0}
              max={500}
              step={0.1}
              onChange={(value) => setConfig((prev) => prev ? ({
                ...prev,
                strategy: {
                  ...prev.strategy,
                  constraints: {
                    ...prev.strategy.constraints,
                    tradeFeeRateBps: Math.max(0, Math.min(500, value)),
                  },
                },
              }) : prev)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">数据源</CardTitle>
          <CardDescription>行情、资讯、汇率与 LLM 分析配置。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="daa-checkbox"
              checked={config.dataSources.priceFeed.enabled}
              onChange={(e) => setConfig((prev) => prev ? ({
                ...prev,
                dataSources: {
                  ...prev.dataSources,
                  priceFeed: { ...prev.dataSources.priceFeed, enabled: e.target.checked },
                },
              }) : prev)}
            />
            启用行情源
          </label>
          <div className="space-y-1.5">
            <Label>行情 Provider</Label>
            <Input
              value={config.dataSources.priceFeed.provider}
              onChange={(e) => setConfig((prev) => prev ? ({
                ...prev,
                dataSources: {
                  ...prev.dataSources,
                  priceFeed: { ...prev.dataSources.priceFeed, provider: e.target.value.trim() || "yfinance" },
                },
              }) : prev)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>行情刷新间隔 (分钟)</Label>
            <NumberInput
              value={config.dataSources.priceFeed.intervalMinutes}
              min={1}
              max={240}
              onChange={(value) => setConfig((prev) => prev ? ({
                ...prev,
                dataSources: {
                  ...prev.dataSources,
                  priceFeed: { ...prev.dataSources.priceFeed, intervalMinutes: Math.max(1, Math.trunc(value || 1)) },
                },
              }) : prev)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="daa-checkbox"
              checked={config.dataSources.newsFeed.enabled}
              onChange={(e) => setConfig((prev) => prev ? ({
                ...prev,
                dataSources: {
                  ...prev.dataSources,
                  newsFeed: { ...prev.dataSources.newsFeed, enabled: e.target.checked },
                },
              }) : prev)}
            />
            启用资讯源
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="daa-checkbox"
              checked={config.dataSources.fxFeed.enabled}
              onChange={(e) => setConfig((prev) => prev ? ({
                ...prev,
                dataSources: {
                  ...prev.dataSources,
                  fxFeed: { ...prev.dataSources.fxFeed, enabled: e.target.checked },
                },
              }) : prev)}
            />
            启用汇率源
          </label>
          <div className="space-y-1.5">
            <Label>汇率币对</Label>
            <Input
              value={config.dataSources.fxFeed.pairs.join(", ")}
              onChange={(e) => {
                const pairs = e.target.value
                  .split(/[,\s]+/g)
                  .map((item) => item.trim().toUpperCase().replace(/-/g, "/"))
                  .filter((item) => /^[A-Z]{3}\/[A-Z]{3}$/.test(item));
                setConfig((prev) => prev ? ({
                  ...prev,
                  dataSources: {
                    ...prev.dataSources,
                    fxFeed: { ...prev.dataSources.fxFeed, pairs: [...new Set(pairs)] },
                  },
                }) : prev);
              }}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="daa-checkbox"
              checked={config.dataSources.llmAnalysis.enabled}
              onChange={(e) => setConfig((prev) => prev ? ({
                ...prev,
                dataSources: {
                  ...prev.dataSources,
                  llmAnalysis: { ...prev.dataSources.llmAnalysis, enabled: e.target.checked },
                },
              }) : prev)}
            />
            启用 LLM 分析
          </label>
          <div className="space-y-1.5">
            <Label>模型</Label>
            <Input
              value={config.dataSources.llmAnalysis.model}
              onChange={(e) => setConfig((prev) => prev ? ({
                ...prev,
                dataSources: {
                  ...prev.dataSources,
                  llmAnalysis: { ...prev.dataSources.llmAnalysis, model: e.target.value.trim() || "gpt-5-codex" },
                },
              }) : prev)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">人因数据源</CardTitle>
          <CardDescription>信号叠加层配置与基金池范围。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="daa-checkbox"
              checked={config.dataSources.hfFund.enabled}
              onChange={(e) => setConfig((prev) => prev ? ({
                ...prev,
                dataSources: {
                  ...prev.dataSources,
                  hfFund: { ...prev.dataSources.hfFund, enabled: e.target.checked },
                },
              }) : prev)}
            />
            启用人因信号
          </label>
          <div className="space-y-1.5">
            <Label>市场范围</Label>
            <Input
              value={config.dataSources.hfFund.marketScope.join(", ")}
              onChange={(e) => {
                const marketScope = e.target.value
                  .split(/[,\s]+/g)
                  .map((item) => item.trim().toUpperCase())
                  .filter(Boolean);
                setConfig((prev) => prev ? ({
                  ...prev,
                  dataSources: {
                    ...prev.dataSources,
                    hfFund: { ...prev.dataSources.hfFund, marketScope: [...new Set(marketScope)] },
                  },
                }) : prev);
              }}
            />
          </div>
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground md:col-span-2">
            当前基金池数量：{config.dataSources.hfFund.funds.length}（如需增删基金，可通过后续基金池管理功能维护）
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">通知</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="daa-checkbox"
              checked={config.notification.email.onSuggestionGenerated}
              onChange={(e) => setConfig((prev) => prev ? ({
                ...prev,
                notification: {
                  ...prev.notification,
                  email: { ...prev.notification.email, onSuggestionGenerated: e.target.checked },
                },
              }) : prev)}
            />
            再平衡建议生成时发送邮件
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="daa-checkbox"
              checked={config.notification.email.dailyReport}
              onChange={(e) => setConfig((prev) => prev ? ({
                ...prev,
                notification: {
                  ...prev.notification,
                  email: { ...prev.notification.email, dailyReport: e.target.checked },
                },
              }) : prev)}
            />
            发送每日分析报告
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="daa-checkbox"
              checked={config.notification.telegram.enabled}
              onChange={(e) => setConfig((prev) => prev ? ({
                ...prev,
                notification: {
                  ...prev.notification,
                  telegram: { ...prev.notification.telegram, enabled: e.target.checked },
                },
              }) : prev)}
            />
            启用 Telegram
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="daa-checkbox"
              checked={config.notification.telegram.onDriftTrigger}
              onChange={(e) => setConfig((prev) => prev ? ({
                ...prev,
                notification: {
                  ...prev.notification,
                  telegram: { ...prev.notification.telegram, onDriftTrigger: e.target.checked },
                },
              }) : prev)}
            />
            偏移触发时通知
          </label>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => void saveConfig()} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "保存中..." : "保存全部设置"}
        </Button>
      </div>
    </div>
  );
}
