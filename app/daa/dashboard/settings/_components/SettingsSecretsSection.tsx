"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Eye, EyeOff, KeyRound, Lock, Pencil, PlugZap, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { SectionCard } from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";
import { DaaSurfaceActionButton } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import {
  deleteSecretValue,
  listSecrets,
  testSecretConnectivity,
  writeSecretValue,
  type StoreSecretStatus,
  type StoreSecretTestMode,
  type StoreSecretTestResult,
} from "@/src/daa/modules/store/storeApi";

// ─────────────────────────────────────────────────────────────────────────────
// Group definitions
// ─────────────────────────────────────────────────────────────────────────────

const GROUP_META: Record<string, { label: string; order: number }> = {
  llm: { label: "LLM / 研究模型", order: 0 },
  telegram: { label: "Telegram", order: 1 },
  feishu: { label: "飞书", order: 2 },
  supabase: { label: "Supabase 认证", order: 3 },
  cron: { label: "定时任务", order: 4 },
  fred: { label: "FRED 宏观数据", order: 5 },
  twitter_data: { label: "Twitter 数据", order: 6 },
  finnhub: { label: "Finnhub 新闻", order: 7 },
  embedding: { label: "Embedding 向量", order: 8 },
};

const TESTABLE_KEYS = new Set(["llm_api_key", "telegram_bot_token", "feishu_webhook_url", "fred_api_key", "finnhub_api_key", "embedding_api_key"]);
const DELIVERABLE_KEYS = new Set(["telegram_bot_token", "feishu_webhook_url"]);

/** 凭证注册/获取链接 */
const SECRET_URLS: Record<string, { label: string; url: string }> = {
  finnhub_api_key: { label: "Finnhub 注册", url: "https://finnhub.io/register" },
  fred_api_key: { label: "FRED 申请", url: "https://fred.stlouisfed.org/docs/api/api_key.html" },
  llm_api_key: { label: "DeepSeek 控制台", url: "https://platform.deepseek.com/api_keys" },
  twitterdata_token: { label: "TwitterData", url: "https://pro.twitterdata.com" },
  embedding_api_key: { label: "SiliconFlow 控制台", url: "https://cloud.siliconflow.cn/" },
};

// ─────────────────────────────────────────────────────────────────────────────
// SecretRow
// ─────────────────────────────────────────────────────────────────────────────

function SecretRow({
  secret,
  onSaved,
  testResult,
  onTest,
  testing,
}: {
  secret: StoreSecretStatus;
  onSaved: (secrets: StoreSecretStatus[]) => void;
  testResult: StoreSecretTestResult | null;
  onTest: (key: string, mode: StoreSecretTestMode) => void;
  testing: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const secrets = await writeSecretValue(secret.key, value);
      onSaved(secrets);
      setEditing(false);
      setValue("");
      toast.success(`${secret.label} 已保存`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [secret.key, secret.label, value, onSaved]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      const secrets = await deleteSecretValue(secret.key);
      onSaved(secrets);
      toast.success(`${secret.label} 已删除`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  }, [secret.key, secret.label, onSaved]);

  const sourceLabel = secret.source === "env" ? "环境变量" : secret.source === "db" ? "数据库" : "未配置";
  const isTestable = TESTABLE_KEYS.has(secret.key);
  const isDeliverable = DELIVERABLE_KEYS.has(secret.key);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-2.5">
      {/* Label + source */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-[var(--text)]">{secret.label}</span>
          {SECRET_URLS[secret.key] ? (
            <a
              href={SECRET_URLS[secret.key].url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-[var(--primary)] hover:underline"
            >
              {SECRET_URLS[secret.key].label} ↗
            </a>
          ) : null}
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            secret.source === "env"
              ? "bg-blue-500/10 text-blue-400"
              : secret.source === "db"
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-zinc-500/10 text-zinc-500"
          }`}>
            {secret.source === "env" && <Lock className="h-2.5 w-2.5" />}
            {sourceLabel}
          </span>
        </div>

        {/* Masked value or editing input */}
        {editing ? (
          <div className="mt-2 flex items-center gap-2">
            <div className="relative flex-1">
              <input
                id={`secret-${secret.key}`}
                name={`secret-${secret.key}`}
                type={secret.sensitive && !showValue ? "password" : "text"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={secret.sensitive ? "输入新值…" : "输入值…"}
                className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--elevated)] px-2.5 py-1.5 pr-8 text-[13px] text-[var(--text)] outline-none transition-colors focus:border-[var(--primary)]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSave();
                  if (e.key === "Escape") { setEditing(false); setValue(""); }
                }}
              />
              {secret.sensitive && (
                <button
                  type="button"
                  onClick={() => setShowValue(!showValue)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--faint)] hover:text-[var(--muted)]"
                >
                  {showValue ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
            <DaaSurfaceActionButton
              tone="primary"
              onClick={() => void handleSave()}
              disabled={saving || !value.trim()}
              className="p-1.5"
            >
              <Check className="h-3.5 w-3.5" />
            </DaaSurfaceActionButton>
            <DaaSurfaceActionButton
              tone="slate"
              onClick={() => { setEditing(false); setValue(""); }}
              className="p-1.5"
            >
              <X className="h-3.5 w-3.5" />
            </DaaSurfaceActionButton>
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-2">
            <code className={`text-[12px] ${secret.masked ? "text-[var(--muted)]" : "text-zinc-600 italic"}`}>
              {secret.masked || "—"}
            </code>
            {testResult && (
              <span className={`text-[11px] ${testResult.success ? "text-emerald-400" : "text-red-400"}`}>
                {testResult.success ? "✓" : "✗"} {testResult.message} ({testResult.latencyMs}ms)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {!editing && (
        <div className="flex items-center gap-1">
          {isTestable && secret.source !== "empty" && (
            <button
              type="button"
              onClick={() => onTest(secret.key, "connectivity")}
              disabled={testing}
              title="连通性测试"
              className="rounded-md p-1.5 text-[var(--faint)] transition-colors hover:bg-[var(--elevated)] hover:text-[var(--primary)] disabled:opacity-40"
            >
              <PlugZap className={`h-3.5 w-3.5 ${testing ? "animate-pulse" : ""}`} />
            </button>
          )}
          {isDeliverable && secret.source !== "empty" && (
            <button
              type="button"
              onClick={() => onTest(secret.key, "deliver")}
              disabled={testing}
              title="发送测试消息"
              className="rounded-md p-1.5 text-[var(--faint)] transition-colors hover:bg-[var(--elevated)] hover:text-emerald-400 disabled:opacity-40"
            >
              <Send className={`h-3.5 w-3.5 ${testing ? "animate-pulse" : ""}`} />
            </button>
          )}
          {!secret.readOnly && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              title={secret.source === "env" ? "环境变量优先，DB 值仅在无 env 时使用" : "编辑"}
              className="rounded-md p-1.5 text-[var(--faint)] transition-colors hover:bg-[var(--elevated)] hover:text-[var(--text)]"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {!secret.readOnly && secret.source === "db" && (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              title="从数据库中删除"
              className="rounded-md p-1.5 text-[var(--faint)] transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Section
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsSecretsSection() {
  const [secrets, setSecrets] = useState<StoreSecretStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [testResults, setTestResults] = useState<Record<string, StoreSecretTestResult>>({});
  const [testingKey, setTestingKey] = useState<string | null>(null);

  const loadSecrets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listSecrets();
      setSecrets(data);
    } catch {
      toast.error("加载凭证状态失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSecrets();
  }, [loadSecrets]);

  const handleTest = useCallback(async (key: string, mode: StoreSecretTestMode = "connectivity") => {
    setTestingKey(key);
    try {
      const result = await testSecretConnectivity(key, mode);
      setTestResults((prev) => ({ ...prev, [key]: result }));
      if (result.success) {
        toast.success(`${result.message}`);
      } else {
        toast.error(`测试失败: ${result.message}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "测试失败");
    } finally {
      setTestingKey(null);
    }
  }, []);

  // Group secrets
  const groups = new Map<string, StoreSecretStatus[]>();
  for (const secret of secrets) {
    const list = groups.get(secret.group) || [];
    list.push(secret);
    groups.set(secret.group, list);
  }

  const sortedGroups = [...groups.entries()].sort(
    (a, b) => (GROUP_META[a[0]]?.order ?? 99) - (GROUP_META[b[0]]?.order ?? 99),
  );
  const secretSummary = useMemo(() => {
    const total = secrets.length;
    const configured = secrets.filter((item) => item.source !== "empty").length;
    const envCount = secrets.filter((item) => item.source === "env").length;
    const dbCount = secrets.filter((item) => item.source === "db").length;
    const missingCount = secrets.filter((item) => item.source === "empty").length;
    return { total, configured, envCount, dbCount, missingCount };
  }, [secrets]);

  return (
    <section id="settings-secrets" className="scroll-mt-28">
      <SectionCard title="凭证与密钥">
        {loading ? (
          <div className="py-8 text-center text-sm text-[var(--muted)]">加载凭证状态…</div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "已配置", value: `${secretSummary.configured} / ${secretSummary.total}` },
                { label: "环境变量", value: `${secretSummary.envCount}` },
                { label: "数据库", value: `${secretSummary.dbCount}` },
                { label: "未配置", value: `${secretSummary.missingCount}` },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--faint)]">{item.label}</div>
                  <div className="mt-2 text-sm font-semibold text-[var(--text)]">{item.value}</div>
                </div>
              ))}
            </div>

            {sortedGroups.map(([group, items]) => (
              <div key={group} className="rounded-lg border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-3.5 w-3.5 text-[var(--faint)]" />
                    <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--faint)]">
                      {GROUP_META[group]?.label || group}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--muted)]">
                    已配置 {items.filter((item) => item.source !== "empty").length} / {items.length}
                  </div>
                </div>
                <div className="space-y-2">
                  {items.map((secret) => (
                    <SecretRow
                      key={secret.key}
                      secret={secret}
                      onSaved={setSecrets}
                      testResult={testResults[secret.key] ?? null}
                      onTest={handleTest}
                      testing={testingKey === secret.key}
                    />
                  ))}
                </div>
              </div>
            ))}

            <div className="rounded-lg border border-dashed border-[var(--border)] px-3 py-2.5 text-[12px] leading-5 text-[var(--faint)]">
              环境变量优先级最高，数据库值只在没有对应 env 时才会生效；删除数据库值不会影响已有 env 配置。
            </div>
          </div>
        )}
      </SectionCard>
    </section>
  );
}
