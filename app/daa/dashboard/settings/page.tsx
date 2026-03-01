"use client";

import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
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

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export default function SettingsPage() {
  const [dataSources, setDataSources] = useState<StoreDataSourceV1[]>([]);
  const [notificationConfig, setNotificationConfig] = useState<StoreNotificationConfigV1>({
    enabled: false,
    notifyOnDrift: true,
    notifyOnRebalance: true,
    notifyOnPriceAlert: false,
  });

  const [hfJson, setHfJson] = useState<string>("{}");
  const [priceJson, setPriceJson] = useState<string>("{}");
  const [newsJson, setNewsJson] = useState<string>("{}");
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

      const hf = rows.find((row) => row.kind === "hf_fund")?.configJson || {};
      const price = rows.find((row) => row.kind === "price_feed")?.configJson || {};
      const news = rows.find((row) => row.kind === "news_feed")?.configJson || {};
      setHfJson(JSON.stringify(hf, null, 2));
      setPriceJson(JSON.stringify(price, null, 2));
      setNewsJson(JSON.stringify(news, null, 2));

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

    const hf = parseJson(hfJson);
    const price = parseJson(priceJson);
    const news = parseJson(newsJson);

    if (!hf || !price || !news) {
      setError("数据源配置 JSON 格式不正确，请先修正。");
      setSaving(false);
      return;
    }

    const sourceMap = new Map(dataSources.map((row) => [row.kind, row]));
    const payloadSources: StoreDataSourceV1[] = [
      {
        id: sourceMap.get("hf_fund")?.id || "hf_fund.default",
        kind: "hf_fund",
        enabled: sourceMap.get("hf_fund")?.enabled !== false,
        configJson: hf,
      },
      {
        id: sourceMap.get("price_feed")?.id || "price_feed.default",
        kind: "price_feed",
        enabled: sourceMap.get("price_feed")?.enabled !== false,
        configJson: price,
      },
      {
        id: sourceMap.get("news_feed")?.id || "news_feed.default",
        kind: "news_feed",
        enabled: sourceMap.get("news_feed")?.enabled !== false,
        configJson: news,
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
          <AlertDescription>{error}</AlertDescription>
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
            <CardDescription>三个 JSON 配置块将写入 `daa_data_sources`。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">hf_fund</div>
              <Textarea value={hfJson} onChange={(e) => setHfJson(e.target.value)} className="min-h-[160px] font-mono text-xs" />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">price_feed</div>
              <Textarea value={priceJson} onChange={(e) => setPriceJson(e.target.value)} className="min-h-[160px] font-mono text-xs" />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">news_feed</div>
              <Textarea value={newsJson} onChange={(e) => setNewsJson(e.target.value)} className="min-h-[140px] font-mono text-xs" />
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
              <input type="checkbox" checked={notificationConfig.enabled} onChange={(e) => setNotificationConfig((prev) => ({ ...prev, enabled: e.target.checked }))} />
              启用 Telegram 通知
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={notificationConfig.notifyOnDrift} onChange={(e) => setNotificationConfig((prev) => ({ ...prev, notifyOnDrift: e.target.checked }))} />
              漂移触发时通知
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={notificationConfig.notifyOnRebalance} onChange={(e) => setNotificationConfig((prev) => ({ ...prev, notifyOnRebalance: e.target.checked }))} />
              执行回填后通知
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={notificationConfig.notifyOnPriceAlert} onChange={(e) => setNotificationConfig((prev) => ({ ...prev, notifyOnPriceAlert: e.target.checked }))} />
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
