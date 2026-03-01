"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { getApiErrorMessageV1 } from "@/src/daa/api/clientV1";
import {
  getNotificationConfigV1,
  listDataSourcesV1,
  replaceDataSourcesV1,
  saveNotificationConfigV1,
  type StoreDataSourceV1,
  type StoreNotificationConfigV1,
} from "@/src/daa/modules/store/storeApiV1";

const DAA_DASHBOARD_REFRESH_EVENT_V1 = "daa:dashboard:refresh";
const DAA_DASHBOARD_DATA_UPDATED_EVENT_V1 = "daa:dashboard:data-updated";

function toObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.trunc(parsed));
}

function normalizeSymbolsInput(text: string): string[] {
  const values = String(text || "")
    .split(/[\n,，;\s]+/g)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  return [...new Set(values)];
}

function symbolsToText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => String(item || "").trim().toUpperCase())
    .filter(Boolean)
    .join(", ");
}

export default function SettingsPage() {
  const [dataSources, setDataSources] = useState<StoreDataSourceV1[]>([]);
  const [notificationConfig, setNotificationConfig] = useState<StoreNotificationConfigV1>({
    enabled: false,
    notifyOnDrift: true,
    notifyOnRebalance: true,
    notifyOnPriceAlert: false,
  });

  const [hfEnabled, setHfEnabled] = useState(true);
  const [hfFundCount, setHfFundCount] = useState(0);
  const [hfEnabledFundCount, setHfEnabledFundCount] = useState(0);

  const [priceEnabled, setPriceEnabled] = useState(true);
  const [priceProvider, setPriceProvider] = useState("yfinance");
  const [priceIntervalMinutes, setPriceIntervalMinutes] = useState(5);
  const [priceSymbolsText, setPriceSymbolsText] = useState("");

  const [newsEnabled, setNewsEnabled] = useState(true);
  const [newsProvider, setNewsProvider] = useState("yahoo_rss");
  const [newsQuery, setNewsQuery] = useState("");

  const [hfConfigRaw, setHfConfigRaw] = useState<Record<string, unknown>>({});
  const [priceConfigRaw, setPriceConfigRaw] = useState<Record<string, unknown>>({});
  const [newsConfigRaw, setNewsConfigRaw] = useState<Record<string, unknown>>({});

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const [rows, notifyConfig] = await Promise.all([
        listDataSourcesV1(),
        getNotificationConfigV1(),
      ]);

      setDataSources(rows);

      const hfSource = rows.find((row) => row.kind === "hf_fund");
      const priceSource = rows.find((row) => row.kind === "price_feed");
      const newsSource = rows.find((row) => row.kind === "news_feed");

      const hfConfig = toObject(hfSource?.configJson);
      const priceConfig = toObject(priceSource?.configJson);
      const newsConfig = toObject(newsSource?.configJson);

      const funds = Array.isArray(hfConfig.funds) ? hfConfig.funds : [];
      const enabledFunds = funds.filter((item) => Boolean((item as any)?.enabled));

      setHfEnabled(hfSource?.enabled !== false);
      setHfFundCount(funds.length);
      setHfEnabledFundCount(enabledFunds.length);
      setHfConfigRaw(hfConfig);

      setPriceEnabled(priceSource?.enabled !== false);
      setPriceProvider(String(priceConfig.provider || "yfinance").trim() || "yfinance");
      setPriceIntervalMinutes(toPositiveInt(priceConfig.intervalMinutes, 5));
      setPriceSymbolsText(symbolsToText(priceConfig.symbols));
      setPriceConfigRaw(priceConfig);

      setNewsEnabled(newsSource?.enabled !== false);
      setNewsProvider(String(newsConfig.provider || "yahoo_rss").trim() || "yahoo_rss");
      setNewsQuery(String(newsConfig.query || "").trim());
      setNewsConfigRaw(newsConfig);

      setNotificationConfig({
        enabled: Boolean(notifyConfig?.enabled),
        notifyOnDrift: notifyConfig?.notifyOnDrift !== false,
        notifyOnRebalance: notifyConfig?.notifyOnRebalance !== false,
        notifyOnPriceAlert: Boolean(notifyConfig?.notifyOnPriceAlert),
      });
    } catch (e) {
      setError(getApiErrorMessageV1(e));
    } finally {
      setLoading(false);
      window.dispatchEvent(new CustomEvent(DAA_DASHBOARD_DATA_UPDATED_EVENT_V1, { detail: { ts: Date.now() } }));
    }
  }

  useEffect(() => {
    function onRefresh() {
      void load();
    }
    void load();
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    return () => window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    setSuccess("");

    const symbols = normalizeSymbolsInput(priceSymbolsText);
    if (!symbols.length) {
      setError("价格源至少需要 1 个 symbol。\n可使用逗号、空格或换行分隔。");
      setSaving(false);
      return;
    }

    const sourceMap = new Map(dataSources.map((row) => [row.kind, row]));
    const priceConfig = {
      ...priceConfigRaw,
      provider: priceProvider.trim() || "yfinance",
      intervalMinutes: toPositiveInt(priceIntervalMinutes, 5),
      symbols,
    };
    const newsConfig = {
      ...newsConfigRaw,
      provider: newsProvider.trim() || "yahoo_rss",
      query: newsQuery.trim(),
    };

    const payloadSources: StoreDataSourceV1[] = [
      {
        id: sourceMap.get("hf_fund")?.id || "hf_fund.default",
        kind: "hf_fund",
        enabled: hfEnabled,
        configJson: hfConfigRaw,
      },
      {
        id: sourceMap.get("price_feed")?.id || "price_feed.default",
        kind: "price_feed",
        enabled: priceEnabled,
        configJson: priceConfig,
      },
      {
        id: sourceMap.get("news_feed")?.id || "news_feed.default",
        kind: "news_feed",
        enabled: newsEnabled,
        configJson: newsConfig,
      },
    ];

    try {
      await Promise.all([
        replaceDataSourcesV1(payloadSources),
        saveNotificationConfigV1(notificationConfig),
      ]);

      setSuccess("设置已保存。密钥请继续使用环境变量管理。\nTELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID");
      await load();
    } catch (e) {
      setError(getApiErrorMessageV1(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="系统设置" description="统一维护数据源配置与通知开关（敏感密钥只放环境变量）。" />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>保存失败</AlertTitle>
          <AlertDescription className="whitespace-pre-line">{error}</AlertDescription>
        </Alert>
      ) : null}

      {success ? (
        <Alert>
          <AlertTitle>保存成功</AlertTitle>
          <AlertDescription className="whitespace-pre-line">{success}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">数据源配置</CardTitle>
            <CardDescription>结构化配置更适合日常运维，避免直接改 JSON。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium">hf_fund（基金池）</div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={hfEnabled} onChange={(e) => setHfEnabled(e.target.checked)} />
                  启用
                </label>
              </div>
              <div className="text-xs text-muted-foreground">
                已配置基金 {hfFundCount} 只，启用 {hfEnabledFundCount} 只。
              </div>
              <div className="mt-2">
                <Button asChild variant="outline" size="sm">
                  <Link href="/daa/dashboard/human-factor">前往人因中心维护基金池</Link>
                </Button>
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium">price_feed（行情源）</div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={priceEnabled} onChange={(e) => setPriceEnabled(e.target.checked)} />
                  启用
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Provider</Label>
                  <Input
                    value={priceProvider}
                    onChange={(e) => setPriceProvider(e.target.value)}
                    placeholder="yfinance / finnhub"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>刷新间隔（分钟）</Label>
                  <Input
                    type="number"
                    min={1}
                    value={priceIntervalMinutes}
                    onChange={(e) => setPriceIntervalMinutes(toPositiveInt(e.target.value, 5))}
                  />
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <Label>Symbols（逗号/空格/换行分隔）</Label>
                <Input
                  value={priceSymbolsText}
                  onChange={(e) => setPriceSymbolsText(e.target.value)}
                  placeholder="SPY, QQQ, BND, TSLA"
                />
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium">news_feed（资讯源）</div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={newsEnabled} onChange={(e) => setNewsEnabled(e.target.checked)} />
                  启用
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Provider</Label>
                  <Input
                    value={newsProvider}
                    onChange={(e) => setNewsProvider(e.target.value)}
                    placeholder="yahoo_rss / twitter"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Query</Label>
                  <Input
                    value={newsQuery}
                    onChange={(e) => setNewsQuery(e.target.value)}
                    placeholder="SPY OR QQQ OR TSLA"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">通知配置</CardTitle>
            <CardDescription>通知通道配置持久化到 DB；Token 与 Chat ID 来自环境变量。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={notificationConfig.enabled}
                onChange={(e) => setNotificationConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
              />
              启用 Telegram 通知
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={notificationConfig.notifyOnDrift}
                onChange={(e) => setNotificationConfig((prev) => ({ ...prev, notifyOnDrift: e.target.checked }))}
              />
              漂移触发时通知
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={notificationConfig.notifyOnRebalance}
                onChange={(e) => setNotificationConfig((prev) => ({ ...prev, notifyOnRebalance: e.target.checked }))}
              />
              执行回填后通知
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={notificationConfig.notifyOnPriceAlert}
                onChange={(e) => setNotificationConfig((prev) => ({ ...prev, notifyOnPriceAlert: e.target.checked }))}
              />
              价格告警通知（预留）
            </label>

            <div className="space-y-2 pt-2">
              <div className="text-xs text-muted-foreground">环境变量建议</div>
              <Input readOnly value="TELEGRAM_BOT_TOKEN" className="h-8 font-mono text-xs" />
              <Input readOnly value="TELEGRAM_CHAT_ID" className="h-8 font-mono text-xs" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" onClick={() => void save()} disabled={loading || saving}>
          {saving ? "保存中..." : "保存设置"}
        </Button>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading || saving}>
          重新加载
        </Button>
      </div>
    </div>
  );
}
