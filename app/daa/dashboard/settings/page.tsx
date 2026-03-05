"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { ApiClientErrorV1, getApiErrorMessageV1 } from "@/src/daa/api/clientV1";
import {
  getLlmEnvStatusV1,
  getSystemConfigV2,
  listFxRatesV1,
  patchSystemConfigV2,
  pullDailyFxSnapshotV1,
  type StoreLlmEnvStatusV1,
  type StoreFxRateV1,
  upsertFxRatesV1,
} from "@/src/daa/modules/store/storeApiV1";

const DAA_DASHBOARD_REFRESH_EVENT_V1 = "daa:dashboard:refresh";
const DAA_DASHBOARD_DATA_UPDATED_EVENT_V1 = "daa:dashboard:data-updated";

const PRICE_PROVIDER_OPTIONS = ["yfinance", "finnhub", "manual"] as const;
const NEWS_PROVIDER_OPTIONS = ["yahoo_rss", "manual"] as const;
const FX_PROVIDER_OPTIONS = ["manual", "yfinance"] as const;
const FX_BASE_CURRENCY_OPTIONS = ["USD", "CNY", "HKD"] as const;
const LLM_PROVIDER_OPTIONS = ["codex", "openai", "packycode"] as const;
const LLM_MODEL_OPTIONS = ["gpt-5-codex", "gpt-5", "gpt-5-mini", "gpt-4.1"] as const;

type NotificationConfig = {
  enabled: boolean;
  notifyOnDrift: boolean;
  notifyOnRebalance: boolean;
  notifyOnPriceAlert: boolean;
};

type SectionKey = "hf" | "price" | "news" | "fx" | "llm" | "backtest" | "notification" | "fxRates";

type SectionState = {
  status: "idle" | "saving" | "saved" | "error";
  message: string;
  at: number | null;
};

function createInitialSectionStates(): Record<SectionKey, SectionState> {
  return {
    hf: { status: "idle", message: "", at: null },
    price: { status: "idle", message: "", at: null },
    news: { status: "idle", message: "", at: null },
    fx: { status: "idle", message: "", at: null },
    llm: { status: "idle", message: "", at: null },
    backtest: { status: "idle", message: "", at: null },
    notification: { status: "idle", message: "", at: null },
    fxRates: { status: "idle", message: "", at: null },
  };
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.trunc(parsed));
}

function normalizeCurrencyInput(value: unknown, fallback = "USD"): string {
  const raw = String(value || "").trim().toUpperCase();
  const normalized = raw === "RMB" || raw === "CNH" ? "CNY" : raw;
  return normalized || fallback;
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
    if (!/^[A-Z]{3}\/[A-Z]{3}$/.test(pair)) continue;
    const [base, quote] = pair.split("/");
    out.add(`${normalizeCurrencyInput(base)}/${normalizeCurrencyInput(quote)}`);
  }
  return [...out];
}

function formatStatusText(state: SectionState): string {
  if (state.status === "saving") return "保存中...";
  if (state.status === "error") return state.message || "保存失败";
  if (state.status === "saved") {
    if (!state.at) return "已保存";
    return `已保存 ${new Date(state.at).toLocaleTimeString()}`;
  }
  return "未改动";
}

function snapshotValue(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function isVersionConflictError(error: unknown): boolean {
  return error instanceof ApiClientErrorV1 && (error.code === "VERSION_CONFLICT" || error.status === 409);
}

function emitDashboardUpdated() {
  window.dispatchEvent(new CustomEvent(DAA_DASHBOARD_DATA_UPDATED_EVENT_V1, { detail: { ts: Date.now() } }));
}

export default function SettingsPage() {
  const [systemVersion, setSystemVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const hydratingRef = useRef(false);
  const systemVersionRef = useRef<number | null>(null);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const sectionSnapshotsRef = useRef<Record<SectionKey, string>>({
    hf: "",
    price: "",
    news: "",
    fx: "",
    llm: "",
    backtest: "",
    notification: "",
    fxRates: "",
  });

  const [sectionStates, setSectionStates] = useState<Record<SectionKey, SectionState>>(createInitialSectionStates);

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
  const [llmEnvStatus, setLlmEnvStatus] = useState<StoreLlmEnvStatusV1 | null>(null);
  const [benchmarkSymbol, setBenchmarkSymbol] = useState("SPY");

  const [notificationConfig, setNotificationConfig] = useState<NotificationConfig>({
    enabled: false,
    notifyOnDrift: true,
    notifyOnRebalance: true,
    notifyOnPriceAlert: false,
  });

  const [fxRates, setFxRates] = useState<StoreFxRateV1[]>([]);
  const [pullingFxSnapshot, setPullingFxSnapshot] = useState(false);
  const [fxSnapshotHint, setFxSnapshotHint] = useState("");

  const priceSymbols = useMemo(() => normalizeSymbolsInput(priceSymbolsText), [priceSymbolsText]);
  const fxPairs = useMemo(() => normalizeFxPairsInput(fxPairsText), [fxPairsText]);

  const setSectionState = useCallback((key: SectionKey, next: SectionState) => {
    setSectionStates((prev) => ({ ...prev, [key]: next }));
  }, []);

  const clearSectionErrorState = useCallback((key: SectionKey) => {
    setSectionStates((prev) => {
      if (prev[key].status !== "error") return prev;
      return {
        ...prev,
        [key]: { status: "idle", message: "", at: null },
      };
    });
  }, []);

  useEffect(() => {
    systemVersionRef.current = systemVersion;
  }, [systemVersion]);

  const persistPatches = useCallback(
    async (key: SectionKey, patches: Array<{ path: string; value: unknown }>, snapshot: string) => {
      if (hydratingRef.current || systemVersionRef.current == null) return;
      if (sectionSnapshotsRef.current[key] === snapshot) return;

      const run = async () => {
        if (hydratingRef.current || systemVersionRef.current == null) return;
        if (sectionSnapshotsRef.current[key] === snapshot) return;

        setSectionState(key, { status: "saving", message: "", at: Date.now() });

        let baseVersion = systemVersionRef.current;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const saved = await patchSystemConfigV2({ baseVersion, patches });
            sectionSnapshotsRef.current[key] = snapshot;
            systemVersionRef.current = saved.version;
            setSystemVersion(saved.version);
            setSectionState(key, { status: "saved", message: "", at: Date.now() });
            emitDashboardUpdated();
            return;
          } catch (e) {
            if (isVersionConflictError(e) && attempt === 0) {
              const latest = await getSystemConfigV2();
              systemVersionRef.current = latest.version;
              setSystemVersion(latest.version);
              baseVersion = latest.version;
              continue;
            }
            setSectionState(key, {
              status: "error",
              message: getApiErrorMessageV1(e),
              at: Date.now(),
            });
            return;
          }
        }
      };

      const task = persistQueueRef.current.then(run);
      persistQueueRef.current = task.catch(() => undefined);
      await task;
    },
    [setSectionState],
  );

  const saveFxRates = useCallback(async () => {
    if (hydratingRef.current) return;
    const snapshot = snapshotValue(
      fxRates.map((row) => ({
        baseCcy: normalizeCurrencyInput(row.baseCcy, "USD"),
        quoteCcy: normalizeCurrencyInput(row.quoteCcy, "CNY"),
        rate: Number(row.rate) || 0,
        source: String(row.source || "manual"),
      })),
    );
    if (sectionSnapshotsRef.current.fxRates === snapshot) {
      clearSectionErrorState("fxRates");
      return;
    }

    setSectionState("fxRates", { status: "saving", message: "", at: Date.now() });
    try {
      await upsertFxRatesV1(fxRates);
      sectionSnapshotsRef.current.fxRates = snapshot;
      setSectionState("fxRates", { status: "saved", message: "", at: Date.now() });
      emitDashboardUpdated();
    } catch (e) {
      setSectionState("fxRates", {
        status: "error",
        message: getApiErrorMessageV1(e),
        at: Date.now(),
      });
    }
  }, [clearSectionErrorState, fxRates, setSectionState]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    hydratingRef.current = true;
    try {
      const [system, rates, envStatus] = await Promise.all([getSystemConfigV2(), listFxRatesV1(), getLlmEnvStatusV1()]);
      systemVersionRef.current = system.version;
      setSystemVersion(system.version);
      setFxRates(rates);

      const config = system.config;
      const hfPayload = {
        enabled: config.dataSources.hfFund.enabled !== false,
      };
      const pricePayload = {
        enabled: config.dataSources.priceFeed.enabled !== false,
        provider: String(config.dataSources.priceFeed.provider || "yfinance"),
        intervalMinutes: toPositiveInt(config.dataSources.priceFeed.intervalMinutes, 5),
        symbols: normalizeSymbolsInput(symbolsToText(config.dataSources.priceFeed.symbols)),
      };
      const newsPayload = {
        enabled: config.dataSources.newsFeed.enabled !== false,
        provider: String(config.dataSources.newsFeed.provider || "yahoo_rss"),
        query: String(config.dataSources.newsFeed.query || ""),
      };
      const fxPayload = {
        enabled: config.dataSources.fxFeed.enabled !== false,
        provider: String(config.dataSources.fxFeed.provider || "manual"),
        baseCurrency: normalizeCurrencyInput(config.dataSources.fxFeed.baseCurrency, "USD"),
        pairs: normalizeFxPairsInput(symbolsToText(config.dataSources.fxFeed.pairs)),
      };
      const llmPayload = {
        enabled: config.dataSources.llmAnalysis.enabled === true,
        provider: String(config.dataSources.llmAnalysis.provider || "codex"),
        model: String(config.dataSources.llmAnalysis.model || "gpt-5-codex"),
        timeoutMs: toPositiveInt(config.dataSources.llmAnalysis.timeoutMs, 8000),
        enabledInDecision: Boolean(config.dataSources.llmAnalysis.enabledInDecision),
      };
      const backtestPayload = {
        benchmarkSymbol: String(config.backtest.benchmarkSymbol || "SPY").trim().toUpperCase() || "SPY",
      };
      const notificationPayload: NotificationConfig = {
        enabled: Boolean(config.notification.enabled),
        notifyOnDrift: config.notification.notifyOnDrift !== false,
        notifyOnRebalance: config.notification.notifyOnRebalance !== false,
        notifyOnPriceAlert: Boolean(config.notification.notifyOnPriceAlert),
      };
      const fxRatesSnapshot = snapshotValue(
        rates.map((row) => ({
          baseCcy: normalizeCurrencyInput(row.baseCcy, "USD"),
          quoteCcy: normalizeCurrencyInput(row.quoteCcy, "CNY"),
          rate: Number(row.rate) || 0,
          source: String(row.source || "manual"),
        })),
      );

      const hfFunds = Array.isArray(config.dataSources.hfFund.funds) ? config.dataSources.hfFund.funds : [];
      const enabledFunds = hfFunds.filter((fund) => Boolean((fund as any)?.enabled));

      sectionSnapshotsRef.current.hf = snapshotValue(hfPayload);
      sectionSnapshotsRef.current.price = snapshotValue(pricePayload);
      sectionSnapshotsRef.current.news = snapshotValue(newsPayload);
      sectionSnapshotsRef.current.fx = snapshotValue(fxPayload);
      sectionSnapshotsRef.current.llm = snapshotValue(llmPayload);
      sectionSnapshotsRef.current.backtest = snapshotValue(backtestPayload);
      sectionSnapshotsRef.current.notification = snapshotValue(notificationPayload);
      sectionSnapshotsRef.current.fxRates = fxRatesSnapshot;

      setHfEnabled(hfPayload.enabled);
      setHfFundCount(hfFunds.length);
      setHfEnabledFundCount(enabledFunds.length);

      setPriceEnabled(pricePayload.enabled);
      setPriceProvider(pricePayload.provider);
      setPriceIntervalMinutes(pricePayload.intervalMinutes);
      setPriceSymbolsText(pricePayload.symbols.join(", "));

      setNewsEnabled(newsPayload.enabled);
      setNewsProvider(newsPayload.provider);
      setNewsQuery(newsPayload.query);

      setFxEnabled(fxPayload.enabled);
      setFxProvider(fxPayload.provider);
      setFxBaseCurrency(fxPayload.baseCurrency);
      setFxPairsText(fxPayload.pairs.join(", "));

      setLlmEnabled(llmPayload.enabled);
      setLlmProvider(llmPayload.provider);
      setLlmModel(llmPayload.model);
      setLlmTimeoutMs(llmPayload.timeoutMs);
      setLlmEnabledInDecision(llmPayload.enabledInDecision);
      setLlmEnvStatus(envStatus);
      setBenchmarkSymbol(backtestPayload.benchmarkSymbol);

      setNotificationConfig(notificationPayload);
      setSectionStates(createInitialSectionStates());
    } catch (e) {
      setError(getApiErrorMessageV1(e));
    } finally {
      hydratingRef.current = false;
      setLoading(false);
      emitDashboardUpdated();
    }
  }, []);

  useEffect(() => {
    void load();
    function onRefresh() {
      void load();
    }
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    return () => window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
  }, [load]);

  useEffect(() => {
    if (loading) return;
    const payload = { enabled: hfEnabled };
    const snapshot = snapshotValue(payload);
    if (sectionSnapshotsRef.current.hf === snapshot) {
      clearSectionErrorState("hf");
      return;
    }
    const timer = window.setTimeout(() => {
      void persistPatches("hf", [{ path: "/dataSources/hfFund/enabled", value: payload.enabled }], snapshot);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [clearSectionErrorState, hfEnabled, loading, persistPatches]);

  useEffect(() => {
    if (loading) return;
    const payload = {
      enabled: priceEnabled,
      provider: priceProvider,
      intervalMinutes: toPositiveInt(priceIntervalMinutes, 5),
      symbols: priceSymbols,
    };
    const snapshot = snapshotValue(payload);
    if (sectionSnapshotsRef.current.price === snapshot) {
      clearSectionErrorState("price");
      return;
    }
    if (priceEnabled && priceSymbols.length === 0) {
      setSectionState("price", { status: "error", message: "价格源至少需要 1 个 symbol", at: Date.now() });
      return;
    }
    const timer = window.setTimeout(() => {
      void persistPatches("price", [
        {
          path: "/dataSources/priceFeed",
          value: payload,
        },
      ], snapshot);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [clearSectionErrorState, loading, persistPatches, priceEnabled, priceIntervalMinutes, priceProvider, priceSymbols, setSectionState]);

  useEffect(() => {
    if (loading) return;
    const payload = {
      enabled: newsEnabled,
      provider: newsProvider,
      query: newsQuery,
    };
    const snapshot = snapshotValue(payload);
    if (sectionSnapshotsRef.current.news === snapshot) {
      clearSectionErrorState("news");
      return;
    }
    const timer = window.setTimeout(() => {
      void persistPatches("news", [
        {
          path: "/dataSources/newsFeed",
          value: payload,
        },
      ], snapshot);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [clearSectionErrorState, loading, newsEnabled, newsProvider, newsQuery, persistPatches]);

  useEffect(() => {
    if (loading) return;
    const payload = {
      enabled: fxEnabled,
      provider: fxProvider,
      baseCurrency: normalizeCurrencyInput(fxBaseCurrency, "USD"),
      pairs: fxPairs,
    };
    const snapshot = snapshotValue(payload);
    if (sectionSnapshotsRef.current.fx === snapshot) {
      clearSectionErrorState("fx");
      return;
    }
    if (fxEnabled && fxPairs.length === 0) {
      setSectionState("fx", { status: "error", message: "FX 源至少需要 1 个合法币对", at: Date.now() });
      return;
    }
    const timer = window.setTimeout(() => {
      void persistPatches("fx", [
        {
          path: "/dataSources/fxFeed",
          value: payload,
        },
      ], snapshot);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [clearSectionErrorState, fxBaseCurrency, fxEnabled, fxPairs, fxProvider, loading, persistPatches, setSectionState]);

  useEffect(() => {
    if (loading) return;
    const payload = {
      enabled: llmEnabled,
      provider: llmProvider,
      model: llmModel,
      timeoutMs: toPositiveInt(llmTimeoutMs, 8000),
      enabledInDecision: llmEnabledInDecision,
    };
    const snapshot = snapshotValue(payload);
    if (sectionSnapshotsRef.current.llm === snapshot) {
      clearSectionErrorState("llm");
      return;
    }
    const timer = window.setTimeout(() => {
      void persistPatches("llm", [
        {
          path: "/dataSources/llmAnalysis",
          value: payload,
        },
      ], snapshot);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [clearSectionErrorState, llmEnabled, llmEnabledInDecision, llmModel, llmProvider, llmTimeoutMs, loading, persistPatches]);

  useEffect(() => {
    if (loading) return;
    const symbol = String(benchmarkSymbol || "").trim().toUpperCase();
    const payload = { benchmarkSymbol: symbol };
    const snapshot = snapshotValue(payload);
    if (sectionSnapshotsRef.current.backtest === snapshot) {
      clearSectionErrorState("backtest");
      return;
    }
    if (!symbol) {
      setSectionState("backtest", { status: "error", message: "回测基准不能为空", at: Date.now() });
      return;
    }
    const timer = window.setTimeout(() => {
      void persistPatches("backtest", [{ path: "/backtest/benchmarkSymbol", value: symbol }], snapshot);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [benchmarkSymbol, clearSectionErrorState, loading, persistPatches, setSectionState]);

  useEffect(() => {
    if (loading) return;
    const snapshot = snapshotValue(notificationConfig);
    if (sectionSnapshotsRef.current.notification === snapshot) {
      clearSectionErrorState("notification");
      return;
    }
    const timer = window.setTimeout(() => {
      void persistPatches("notification", [
        {
          path: "/notification",
          value: notificationConfig,
        },
      ], snapshot);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [clearSectionErrorState, loading, notificationConfig, persistPatches]);

  useEffect(() => {
    if (loading) return;
    const timer = window.setTimeout(() => {
      void saveFxRates();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [fxRates, loading, saveFxRates]);

  function updateFxRate(index: number, patch: Partial<StoreFxRateV1>) {
    setFxRates((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function addFxRateRow() {
    setFxRates((prev) => [
      ...prev,
      {
        baseCcy: normalizeCurrencyInput(fxBaseCurrency, "USD"),
        quoteCcy: "CNY",
        rate: 7.2,
        source: "manual",
      },
    ]);
  }

  function removeFxRateRow(index: number) {
    setFxRates((prev) => prev.filter((_, i) => i !== index));
  }

  async function pullTodayFxSnapshot() {
    if (pullingFxSnapshot) return;
    if (!fxPairs.length) {
      setError("请先配置至少一个合法币对（例如 USD/CNY）。");
      return;
    }

    setPullingFxSnapshot(true);
    setError("");
    setFxSnapshotHint("");
    try {
      const result = await pullDailyFxSnapshotV1({
        pairs: fxPairs,
        baseCurrency: normalizeCurrencyInput(fxBaseCurrency, "USD"),
      });
      setFxRates(result.rates || []);
      if (result.alreadyPulledToday) {
        setFxSnapshotHint(`今天（${result.day}）已拉取过汇率快照，跳过重复拉取。`);
      } else {
        const count = Array.isArray(result.updatedPairs) ? result.updatedPairs.length : 0;
        setFxSnapshotHint(`汇率快照拉取完成：更新 ${count} 个币对（日期 ${result.day}）。`);
      }
      emitDashboardUpdated();
    } catch (e) {
      setError(getApiErrorMessageV1(e));
    } finally {
      setPullingFxSnapshot(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="系统设置" description="即改即存：每个段落独立保存并显示状态，敏感密钥仍仅放环境变量。" />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>操作失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">数据源配置</CardTitle>
            <CardDescription>约束型控件减少误配置，所有改动自动保存。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium">hf_fund（基金池）</div>
                <span className="text-xs text-muted-foreground">{formatStatusText(sectionStates.hf)}</span>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={hfEnabled} onChange={(e) => setHfEnabled(e.target.checked)} disabled={loading} />
                启用
              </label>
              <div className="mt-2 text-xs text-muted-foreground">已配置基金 {hfFundCount} 只，启用 {hfEnabledFundCount} 只。</div>
              <div className="mt-2">
                <Button asChild variant="outline" size="sm">
                  <Link href="/daa/dashboard/human-factor">前往人因中心维护基金池</Link>
                </Button>
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium">price_feed（行情源）</div>
                <span className="text-xs text-muted-foreground">{formatStatusText(sectionStates.price)}</span>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={priceEnabled} onChange={(e) => setPriceEnabled(e.target.checked)} disabled={loading} />
                启用
              </label>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Provider</Label>
                  <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={priceProvider} onChange={(e) => setPriceProvider(e.target.value)}>
                    {PRICE_PROVIDER_OPTIONS.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>刷新间隔（分钟）</Label>
                  <Input type="number" min={1} value={priceIntervalMinutes} onChange={(e) => setPriceIntervalMinutes(toPositiveInt(e.target.value, 5))} />
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <Label>Symbols（逗号/空格/换行分隔）</Label>
                <Input value={priceSymbolsText} onChange={(e) => setPriceSymbolsText(e.target.value)} placeholder="SPY, QQQ, BND" />
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium">news_feed（资讯源）</div>
                <span className="text-xs text-muted-foreground">{formatStatusText(sectionStates.news)}</span>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={newsEnabled} onChange={(e) => setNewsEnabled(e.target.checked)} disabled={loading} />
                启用
              </label>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Provider</Label>
                  <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={newsProvider} onChange={(e) => setNewsProvider(e.target.value)}>
                    {NEWS_PROVIDER_OPTIONS.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Query</Label>
                  <Input value={newsQuery} onChange={(e) => setNewsQuery(e.target.value)} placeholder="SPY OR QQQ OR TSLA" />
                </div>
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium">fx_feed（汇率源）</div>
                <span className="text-xs text-muted-foreground">{formatStatusText(sectionStates.fx)}</span>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={fxEnabled} onChange={(e) => setFxEnabled(e.target.checked)} disabled={loading} />
                启用
              </label>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Provider</Label>
                  <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={fxProvider} onChange={(e) => setFxProvider(e.target.value)}>
                    {FX_PROVIDER_OPTIONS.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>基准币种</Label>
                  <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={fxBaseCurrency} onChange={(e) => setFxBaseCurrency(normalizeCurrencyInput(e.target.value, "USD"))}>
                    {FX_BASE_CURRENCY_OPTIONS.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <Label>币对（逗号/空格/换行分隔）</Label>
                <Input value={fxPairsText} onChange={(e) => setFxPairsText(e.target.value)} placeholder="USD/CNY, USD/HKD" />
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium">llm_analysis（二次分析）</div>
                <span className="text-xs text-muted-foreground">{formatStatusText(sectionStates.llm)}</span>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={llmEnabled} onChange={(e) => setLlmEnabled(e.target.checked)} disabled={loading} />
                启用
              </label>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Provider</Label>
                  <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={llmProvider} onChange={(e) => setLlmProvider(e.target.value)}>
                    {LLM_PROVIDER_OPTIONS.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Model</Label>
                  <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={llmModel} onChange={(e) => setLlmModel(e.target.value)}>
                    {LLM_MODEL_OPTIONS.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
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
              <div className="mt-3 rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
                <div>密钥管理策略：仅环境变量（不在页面录入，不入库）。</div>
                <div>必填：`OPENAI_API_KEY`、`DAA_LLM_ENDPOINT`、`DAA_LLM_MODEL`（可选）。</div>
                <div>
                  当前状态：API Key {llmEnvStatus?.apiKeyConfigured ? "已配置" : "未配置"} · Endpoint {llmEnvStatus?.endpointConfigured ? "已配置" : "未配置"} · Model {llmEnvStatus?.model || "-"}
                </div>
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium">backtest（回测基准）</div>
                <span className="text-xs text-muted-foreground">{formatStatusText(sectionStates.backtest)}</span>
              </div>
              <div className="space-y-1.5">
                <Label>基准代码</Label>
                <Input
                  value={benchmarkSymbol}
                  onChange={(e) => setBenchmarkSymbol(e.target.value.toUpperCase())}
                  placeholder="SPY"
                />
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium">汇率快照（自动日更 + 手工修正）</div>
                <span className="text-xs text-muted-foreground">{formatStatusText(sectionStates.fxRates)}</span>
              </div>
              <div className="mb-2 flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void pullTodayFxSnapshot()} disabled={pullingFxSnapshot || loading}>
                  {pullingFxSnapshot ? "拉取中..." : "手动立即拉取"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={addFxRateRow}>新增汇率</Button>
              </div>
              <div className="mb-2 text-xs text-muted-foreground">
                系统会在定时任务中每日自动补齐当日 FX 快照；此处仅用于立即补拉或人工修正。
              </div>
              {fxSnapshotHint ? <div className="mb-2 text-xs text-muted-foreground">{fxSnapshotHint}</div> : null}
              <div className="space-y-2">
                {fxRates.length ? (
                  fxRates.map((row, index) => (
                    <div key={`${row.baseCcy}-${row.quoteCcy}-${index}`} className="grid gap-2 rounded border p-2 md:grid-cols-[120px_120px_1fr_120px_56px]">
                      <Input value={normalizeCurrencyInput(row.baseCcy, "USD")} onChange={(e) => updateFxRate(index, { baseCcy: normalizeCurrencyInput(e.target.value, "USD") })} placeholder="USD" />
                      <Input value={normalizeCurrencyInput(row.quoteCcy, "CNY")} onChange={(e) => updateFxRate(index, { quoteCcy: normalizeCurrencyInput(e.target.value, "CNY") })} placeholder="CNY" />
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
            <CardDescription>保存状态：{formatStatusText(sectionStates.notification)}</CardDescription>
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
              交易执行后通知
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
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          重新加载
        </Button>
      </div>
    </div>
  );
}
