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
  listFxRatesV1,
  listDataSourcesV1,
  replaceDataSourcesV1,
  saveNotificationConfigV1,
  type StoreDataSourceV1,
  type StoreFxRateV1,
  type StoreNotificationConfigV1,
  upsertFxRatesV1,
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

function normalizeFxPairsInput(text: string): string[] {
  const tokens = String(text || "")
    .split(/[\n,，;\s]+/g)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  const out = new Set<string>();
  for (const token of tokens) {
    const pair = token.replace(/-/g, "/");
    if (/^[A-Z]{3}\/[A-Z]{3}$/.test(pair)) out.add(pair);
  }
  return [...out];
}

export default function SettingsPage() {
  const [dataSources, setDataSources] = useState<StoreDataSourceV1[]>([]);
  const [fxRates, setFxRates] = useState<StoreFxRateV1[]>([]);
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

  const [fxEnabled, setFxEnabled] = useState(true);
  const [fxProvider, setFxProvider] = useState("manual");
  const [fxBaseCurrency, setFxBaseCurrency] = useState("USD");
  const [fxPairsText, setFxPairsText] = useState("USD/CNY, USD/HKD");

  const [llmEnabled, setLlmEnabled] = useState(false);
  const [llmProvider, setLlmProvider] = useState("codex");
  const [llmModel, setLlmModel] = useState("gpt-5-codex");
  const [llmTimeoutMs, setLlmTimeoutMs] = useState(8000);
  const [llmEnabledInDecision, setLlmEnabledInDecision] = useState(false);

  const [hfConfigRaw, setHfConfigRaw] = useState<Record<string, unknown>>({});
  const [priceConfigRaw, setPriceConfigRaw] = useState<Record<string, unknown>>({});
  const [newsConfigRaw, setNewsConfigRaw] = useState<Record<string, unknown>>({});
  const [fxConfigRaw, setFxConfigRaw] = useState<Record<string, unknown>>({});
  const [llmConfigRaw, setLlmConfigRaw] = useState<Record<string, unknown>>({});

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const [rows, notifyConfig, rates] = await Promise.all([
        listDataSourcesV1(),
        getNotificationConfigV1(),
        listFxRatesV1(),
      ]);

      setDataSources(rows);
      setFxRates(rates);

      const hfSource = rows.find((row) => row.kind === "hf_fund");
      const priceSource = rows.find((row) => row.kind === "price_feed");
      const newsSource = rows.find((row) => row.kind === "news_feed");
      const fxSource = rows.find((row) => row.kind === "fx_feed");
      const llmSource = rows.find((row) => row.kind === "llm_analysis");

      const hfConfig = toObject(hfSource?.configJson);
      const priceConfig = toObject(priceSource?.configJson);
      const newsConfig = toObject(newsSource?.configJson);
      const fxConfig = toObject(fxSource?.configJson);
      const llmConfig = toObject(llmSource?.configJson);

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

      setFxEnabled(fxSource?.enabled !== false);
      setFxProvider(String(fxConfig.provider || "manual").trim() || "manual");
      setFxBaseCurrency(String(fxConfig.baseCurrency || "USD").trim().toUpperCase() || "USD");
      setFxPairsText(symbolsToText((fxConfig as any).pairs));
      setFxConfigRaw(fxConfig);

      setLlmEnabled(llmSource?.enabled === true);
      setLlmProvider(String(llmConfig.provider || "codex").trim() || "codex");
      setLlmModel(String(llmConfig.model || "gpt-5-codex").trim() || "gpt-5-codex");
      setLlmTimeoutMs(toPositiveInt((llmConfig as any).timeoutMs, 8000));
      setLlmEnabledInDecision(Boolean((llmConfig as any).enabledInDecision));
      setLlmConfigRaw(llmConfig);

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
    if (priceEnabled && !symbols.length) {
      setError("价格源至少需要 1 个 symbol。\n可使用逗号、空格或换行分隔。");
      setSaving(false);
      return;
    }

    const fxPairs = normalizeFxPairsInput(fxPairsText);
    if (fxEnabled && !fxPairs.length) {
      setError("FX 源至少需要 1 个币对，例如 USD/CNY。");
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
    const fxConfig = {
      ...fxConfigRaw,
      provider: fxProvider.trim() || "manual",
      baseCurrency: fxBaseCurrency.trim().toUpperCase() || "USD",
      pairs: fxPairs,
    };
    const llmConfig = {
      ...llmConfigRaw,
      provider: llmProvider.trim() || "codex",
      model: llmModel.trim() || "gpt-5-codex",
      timeoutMs: toPositiveInt(llmTimeoutMs, 8000),
      enabledInDecision: llmEnabledInDecision,
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
      {
        id: sourceMap.get("fx_feed")?.id || "fx_feed.default",
        kind: "fx_feed",
        enabled: fxEnabled,
        configJson: fxConfig,
      },
      {
        id: sourceMap.get("llm_analysis")?.id || "llm_analysis.default",
        kind: "llm_analysis",
        enabled: llmEnabled,
        configJson: llmConfig,
      },
    ];

    try {
      await Promise.all([
        replaceDataSourcesV1(payloadSources),
        saveNotificationConfigV1(notificationConfig),
        upsertFxRatesV1(fxRates),
      ]);

      setSuccess("设置已保存。密钥请继续使用环境变量管理。\nTELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID");
      await load();
    } catch (e) {
      setError(getApiErrorMessageV1(e));
    } finally {
      setSaving(false);
    }
  }

  function updateFxRate(index: number, patch: Partial<StoreFxRateV1>) {
    setFxRates((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        ...patch,
      };
      return next;
    });
  }

  function addFxRateRow() {
    setFxRates((prev) => [
      ...prev,
      {
        baseCcy: fxBaseCurrency || "USD",
        quoteCcy: "CNY",
        rate: 7.2,
        source: "manual",
      },
    ]);
  }

  function removeFxRateRow(index: number) {
    setFxRates((prev) => prev.filter((_, i) => i !== index));
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

            <div className="rounded-md border p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium">fx_feed（汇率源）</div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={fxEnabled} onChange={(e) => setFxEnabled(e.target.checked)} />
                  启用
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Provider</Label>
                  <Input value={fxProvider} onChange={(e) => setFxProvider(e.target.value)} placeholder="manual / exchangerate_api" />
                </div>
                <div className="space-y-1.5">
                  <Label>基准币种</Label>
                  <Input value={fxBaseCurrency} onChange={(e) => setFxBaseCurrency(e.target.value.toUpperCase())} placeholder="USD" />
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <Label>币对（逗号/空格/换行分隔）</Label>
                <Input value={fxPairsText} onChange={(e) => setFxPairsText(e.target.value)} placeholder="USD/CNY, USD/HKD, USD/USDT" />
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium">llm_analysis（二次分析）</div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={llmEnabled} onChange={(e) => setLlmEnabled(e.target.checked)} />
                  启用
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Provider</Label>
                  <Input value={llmProvider} onChange={(e) => setLlmProvider(e.target.value)} placeholder="codex / packycode" />
                </div>
                <div className="space-y-1.5">
                  <Label>Model</Label>
                  <Input value={llmModel} onChange={(e) => setLlmModel(e.target.value)} placeholder="gpt-5-codex" />
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>超时（毫秒）</Label>
                  <Input type="number" min={2000} value={llmTimeoutMs} onChange={(e) => setLlmTimeoutMs(toPositiveInt(e.target.value, 8000))} />
                </div>
                <label className="mt-7 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={llmEnabledInDecision} onChange={(e) => setLlmEnabledInDecision(e.target.checked)} />
                  运行决策时启用二次分析
                </label>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">密钥优先从环境变量读取：`OPENAI_API_KEY` 或 `PACKYCODE_API_KEY`。</div>
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium">汇率快照（手工维护）</div>
                <Button type="button" variant="outline" size="sm" onClick={addFxRateRow}>新增汇率</Button>
              </div>
              <div className="space-y-2">
                {fxRates.length ? (
                  fxRates.map((row, index) => (
                    <div key={`${row.baseCcy}-${row.quoteCcy}-${index}`} className="grid gap-2 rounded border p-2 md:grid-cols-[120px_120px_1fr_120px_56px]">
                      <Input value={row.baseCcy} onChange={(e) => updateFxRate(index, { baseCcy: e.target.value.toUpperCase() })} placeholder="USD" />
                      <Input value={row.quoteCcy} onChange={(e) => updateFxRate(index, { quoteCcy: e.target.value.toUpperCase() })} placeholder="CNY" />
                      <Input type="number" min={0} step="0.0001" value={row.rate} onChange={(e) => updateFxRate(index, { rate: Math.max(0, Number(e.target.value) || 0) })} />
                      <Input value={row.source} onChange={(e) => updateFxRate(index, { source: e.target.value })} placeholder="manual" />
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeFxRateRow(index)}>删</Button>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-muted-foreground">暂无汇率，建议至少配置基准币种相关币对。</div>
                )}
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
