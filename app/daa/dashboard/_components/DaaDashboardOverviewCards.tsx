"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle, Copy, Loader2, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { copyTextToClipboard } from "../../copyToClipboard";

const EVT_REFRESH = "daa:dashboard:refresh";
const EVT_DATA_UPDATED = "daa:dashboard:data-updated";

import { loadPortfolioStateV1 } from "../../portfolioStateStore";

type AuthMeOk = {
  ok: true;
  account: { username: string; roles: string[]; status: string };
  session: { lastSeenAt?: string | null };
};

type AuthMeResp = { ok: false; error?: string } | AuthMeOk;

type RunListRow = {
  runId: string;
  createdAt: string;
  kind: string;
  status: string;
  actor: string;
  source: string;
  hasPortfolio: boolean;
  hasConfirm: boolean;
  hasExecuted: boolean;
  auditCount: number;
};

type RunsResp = { ok: boolean; runs?: RunListRow[]; error?: string };

type DeployBootstrapCheck = {
  id: string;
  label: string;
  group: "required" | "bootstrap" | "recommended" | "optional";
  ok: boolean;
  note?: string;
  candidates?: string[];
};

type DeployStatusOk = {
  ok: true;
  env: { nodeEnv: string; deployEnv: string; platform: string };
  build: { sha: string; shaShort: string };
  bootstrap?: {
    checks: DeployBootstrapCheck[];
    missingRequired: string[];
    missingBootstrap: string[];
    missingRecommended: string[];
  };
  serverTime: string;
};

type DeployStatusResp = { ok: false; error?: string } | DeployStatusOk;

type ChecklistOk = boolean | null;

type ChecklistItem = {
  id: string;
  ok: ChecklistOk;
  label: string;
  detail?: ReactNode;
};

function fmtCurrencyCny(n: number): string {
  if (!Number.isFinite(n)) return "-";
  try {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return String(n);
  }
}

function fmtTime(iso: unknown) {
  const s = String(iso ?? "").trim();
  if (!s) return "-";
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return s;
  return new Date(t).toLocaleString();
}

function ChecklistRow({ ok, label, detail }: { ok: ChecklistOk; label: string; detail?: ReactNode }) {
  const Icon = ok === true ? CheckCircle2 : Circle;
  const iconClass = ok === true ? "text-emerald-600" : "text-muted-foreground";
  const title = ok === true ? "Done" : ok === false ? "Missing" : "Unknown";


  return (
    <div className="flex items-start gap-2">
      <Icon className={`mt-0.5 h-4 w-4 ${iconClass}`} aria-label={title} />
      <div className="space-y-0.5">
        <div className="text-xs font-medium text-foreground">{label}</div>
        {detail ? <div className="text-xs text-muted-foreground">{detail}</div> : null}
      </div>
    </div>
  );
}

export default function DaaDashboardOverviewCards() {
  const [auth, setAuth] = useState<AuthMeResp | null>(null);
  const [runsResp, setRunsResp] = useState<RunsResp | null>(null);
  const [deployResp, setDeployResp] = useState<DeployStatusResp | null>(null);
  const [deployLastOkServerTime, setDeployLastOkServerTime] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const portfolio = useMemo(() => {
    try {
      return loadPortfolioStateV1();
    } catch {
      return null;
    }
  }, []);

  const cash = typeof portfolio?.cash === "number" && Number.isFinite(portfolio.cash) ? portfolio.cash : 0;
  const positionsCount = portfolio?.positions ? Object.keys(portfolio.positions).length : 0;

  const latestRun = Array.isArray(runsResp?.runs) && runsResp?.runs?.length ? runsResp?.runs[0] : null;
  const storeOk = !!(runsResp && runsResp.ok);

  useEffect(() => {
    let cancelled = false;

    async function load(opts?: { refresh?: boolean }) {
      const refresh = !!opts?.refresh;
      if (refresh && !cancelled) {
        setIsRefreshing(true);
      }

      try {
        // Fetch in parallel; all endpoints are cookie-auth friendly.
        const [authRes, runsRes, deployRes] = await Promise.allSettled([
          fetch("/api/daa/auth/me", { method: "GET", headers: { accept: "application/json" } }),
          fetch("/api/daa/runs?limit=1", { method: "GET", headers: { accept: "application/json" } }),
          fetch("/api/daa/deploy-status", { method: "GET", headers: { accept: "application/json" } }),
        ]);

        if (cancelled) return;

        if (authRes.status === "fulfilled") {
          try {
            setAuth((await authRes.value.json()) as AuthMeResp);
          } catch {
            setAuth({ ok: false, error: "invalid_json" });
          }
        } else {
          setAuth({ ok: false, error: String(authRes.reason ?? "fetch_failed") });
        }

        if (runsRes.status === "fulfilled") {
          try {
            setRunsResp((await runsRes.value.json()) as RunsResp);
          } catch {
            setRunsResp({ ok: false, error: "invalid_json" });
          }
        } else {
          setRunsResp({ ok: false, error: String(runsRes.reason ?? "fetch_failed") });
        }

        if (deployRes.status === "fulfilled") {
          try {
            const json = (await deployRes.value.json()) as DeployStatusResp;
            setDeployResp(json);
            if (json && (json as any).ok && typeof (json as any).serverTime === "string") {
              setDeployLastOkServerTime((json as any).serverTime);
            }
          } catch {
            setDeployResp({ ok: false, error: "invalid_json" });
          }
        } else {
          setDeployResp({ ok: false, error: String(deployRes.reason ?? "fetch_failed") });
        }

        window.dispatchEvent(new CustomEvent(EVT_DATA_UPDATED, { detail: { ts: Date.now() } }));
      } finally {
        if (!cancelled) {
          setIsRefreshing(false);
        }
      }
    }

    const onRefresh = () => {
      void load({ refresh: true });
    };

    window.addEventListener(EVT_REFRESH, onRefresh);
    void load();

    return () => {
      cancelled = true;
      window.removeEventListener(EVT_REFRESH, onRefresh);
    };
  }, []);

  const who = auth && auth.ok ? auth.account.username : "(not signed in)";
  const roles = auth && auth.ok ? (auth.account.roles || []).join(", ") || "-" : "-";

  const authError = auth && !auth.ok ? String(auth.error ?? "").trim() : "";
  const hasAnyAccounts: ChecklistOk =
    auth === null
      ? null
      : auth.ok
        ? true
        : authError === "bootstrap_required"
          ? false
          : authError === "not_authenticated"
            ? true
            : null;

  const deployEnv = deployResp && deployResp.ok ? deployResp.env.deployEnv : "";
  const nodeEnv = deployResp && deployResp.ok ? deployResp.env.nodeEnv : "";
  const platform = deployResp && deployResp.ok ? deployResp.env.platform : "";
  const sha = deployResp && deployResp.ok ? String(deployResp.build.sha ?? "").trim() : "";
  const shaShort = deployResp && deployResp.ok ? deployResp.build.shaShort : "";

  const deployBootstrapChecks = deployResp && deployResp.ok ? (deployResp.bootstrap?.checks ?? null) : null;

  function deployBootstrapOk(id: string): ChecklistOk {
    if (deployResp === null) return null;
    if (!deployResp.ok) return null;
    if (!Array.isArray(deployBootstrapChecks)) return null;
    const it = deployBootstrapChecks.find((c) => c && typeof c === "object" && (c as any).id === id);
    return it ? !!(it as any).ok : null;
  }

  const dbUrlOk = deployBootstrapOk("DAA_DB_URL");
  const bootstrapTokenOk = deployBootstrapOk("DAA_AUTH_BOOTSTRAP_TOKEN");
  const nextApiOwnerOk = deployBootstrapOk("DAA_ENABLE_FASTAPI_PUBLIC_DAA_ROUTES");

  const deployBootstrapMissingRequiredCount = deployResp && deployResp.ok ? deployResp.bootstrap?.missingRequired?.length ?? 0 : 0;
  const deployBootstrapMissingBootstrapCount = deployResp && deployResp.ok ? deployResp.bootstrap?.missingBootstrap?.length ?? 0 : 0;
  const deployBootstrapMissingRecommendedCount = deployResp && deployResp.ok ? deployResp.bootstrap?.missingRecommended?.length ?? 0 : 0;

  const showDeployBootstrapPanel =
    !!(deployResp && deployResp.ok) &&
    (!sha || deployBootstrapMissingRequiredCount + deployBootstrapMissingBootstrapCount + deployBootstrapMissingRecommendedCount > 0);

  const deployPrereqs: ChecklistItem[] = useMemo(() => {
    return [
      {
        id: "db_url",
        ok: dbUrlOk,
        label: "DAA_DB_URL set",
        detail: (
          <>
            The server needs <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">DAA_DB_URL</code> (or
            <code className="ml-1 rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">DATABASE_URL</code>) pointing to Postgres.
          </>
        ),
      },
      {
        id: "bootstrap_token",
        ok: bootstrapTokenOk,
        label: "DAA_AUTH_BOOTSTRAP_TOKEN set (fresh deploy)",
        detail: (
          <>
            Used to create the first admin via <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">/api/daa/auth/bootstrap</code>.
          </>
        ),
      },
      {
        id: "store",
        ok: runsResp === null ? null : storeOk,
        label: "Store reachable",
        detail: (
          <>
            If this fails, confirm Postgres is reachable and credentials are configured (<code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">DAA_DB_URL</code>).           </>
        ),
      },
      {
        id: "next_api_owner",
        ok: nextApiOwnerOk,
        label: "Public /api/daa owned by Next.js",
        detail: (
          <>
            Keep <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">DAA_ENABLE_FASTAPI_PUBLIC_DAA_ROUTES=0</code> so FastAPI never exposes public
            <code className="ml-1 rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">/api/daa/*</code> routes.
          </>
        ),
      },
      {
        id: "accounts",
        ok: hasAnyAccounts,
        label: "First admin account exists",
        detail:
          hasAnyAccounts === false ? (
            <>
              Create the first admin via the dashboard (Setup required) or using <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">/api/daa/auth/bootstrap</code>.
            </>
          ) : (
            <>If you are rotating credentials, ensure the deploy has the correct secrets configured.</>
          ),
      },
      {
        id: "deploy_env",
        ok: deployEnv ? true : false,
        label: "Deploy env labelled",
        detail: (
          <>
            Set <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">DAA_ENV</code> (or rely on platform env
            like <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">VERCEL_ENV</code>) so the dashboard can
            show which environment you are on.
          </>
        ),
      },
      {
        id: "sha",
        ok: sha ? true : false,
        label: "Build SHA reported",
        detail: (
          <>
            Set <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">NEXT_PUBLIC_BUILD_SHA</code> (or
            <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">DAA_BUILD_SHA</code>/<code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">BUILD_SHA</code>) at deploy time.
          </>
        ),
      },
    ];
  }, [bootstrapTokenOk, dbUrlOk, deployEnv, hasAnyAccounts, nextApiOwnerOk, runsResp, sha, storeOk]);

  const deployBootstrapEnvVarsText = useMemo(() => {
    // Keep the snippet copy/paste friendly for Vercel/Render/Fly/etc.
    const envLabel = deployEnv || "prod";
    return [
      "# Required (server)",
      "DAA_DB_URL=postgresql://daa:daa@localhost:15432/daa",
      "DAA_AUTH_BOOTSTRAP_TOKEN=...",
      "",
      "",
      "# Recommended (env label + build visibility)",
      `DAA_ENV=${envLabel}`,
      "NEXT_PUBLIC_BUILD_SHA=...",
      "",
      "# Optional (Python engine behind nginx; needed for some Step4/5 routes)",
      "DAA_ENGINE_BASE_URL=https://YOUR_DOMAIN",
      "",
      "# Optional (email login)",
      "# RESEND_API_KEY=...",
      "# DAA_AUTH_EMAIL_FROM=admin@YOUR_DOMAIN",
      "# DAA_PUBLIC_ORIGIN=https://YOUR_DOMAIN",
    ].join("\n");
  }, [deployEnv]);

  const deployBootstrapEnvExportsText = useMemo(() => {
    // Same content as the env vars template, but formatted for bash/zsh export.
    const envLabel = deployEnv || "prod";
    return [
      "# Shell export snippet (bash/zsh)",
      'export DAA_DB_URL="postgresql://daa:daa@localhost:15432/daa"',
      'export DAA_AUTH_BOOTSTRAP_TOKEN="..."',
      "",
      "",
      "# Recommended (env label + build visibility)",
      `export DAA_ENV="${envLabel}"`,
      'export NEXT_PUBLIC_BUILD_SHA="..."',
      "",
      "# Optional (Python engine behind nginx; needed for some Step4/5 routes)",
      'export DAA_ENGINE_BASE_URL="https://YOUR_DOMAIN"',
      "",
      "# Optional (email login)",
      '# export RESEND_API_KEY="..."',
      '# export DAA_AUTH_EMAIL_FROM="admin@YOUR_DOMAIN"',
      '# export DAA_PUBLIC_ORIGIN="https://YOUR_DOMAIN"',
    ].join("\n");
  }, [deployEnv]);

  const deployBootstrapCopyAllText = useMemo(() => {
    return [
      "# Deploy bootstrap (DAA)",
      "",
      deployBootstrapEnvVarsText,
      "",
      deployBootstrapEnvExportsText,
      "",
      "# Quick troubleshooting",
      "- No accounts yet: set DAA_AUTH_BOOTSTRAP_TOKEN and create the first admin via /api/daa/auth/bootstrap (or the dashboard setup).",
      "- Build SHA missing: set NEXT_PUBLIC_BUILD_SHA at build/deploy time so /api/daa/deploy-status reports it.",
      "",
      "# Docs",
      "- Deploy guide: https://github.com/Jarvis-agent-bot/Dynamic-Asset-Allocation/blob/main/deploy/README.md",
      "- Quickstart: https://github.com/Jarvis-agent-bot/Dynamic-Asset-Allocation/blob/main/docs/QUICKSTART.md",
      "- Docs: https://github.com/Jarvis-agent-bot/Dynamic-Asset-Allocation/blob/main/docs/README.md",
    ].join("\n");
  }, [deployBootstrapEnvExportsText, deployBootstrapEnvVarsText]);

  async function copyDeployBootstrapAll() {
    try {
      await copyTextToClipboard(deployBootstrapCopyAllText);
      toast.success("Copied deploy bootstrap bundle.");
    } catch (e) {
      toast.error(`Copy failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function copyBuildSha() {
    if (!sha) {
      toast.error("No build SHA available.");
      return;
    }

    try {
      await copyTextToClipboard(sha);
      toast.success(`Copied build SHA: ${shaShort || sha.slice(0, 10)}`);
    } catch (e) {
      toast.error(`Copy failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function copyDeployBootstrapEnvVars() {
    try {
      await copyTextToClipboard(deployBootstrapEnvVarsText);
      toast.success("Copied env vars template.");
    } catch (e) {
      toast.error(`Copy failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function copyDeployBootstrapEnvExports() {
    try {
      await copyTextToClipboard(deployBootstrapEnvExportsText);
      toast.success("Copied env export snippet.");
    } catch (e) {
      toast.error(`Copy failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function requestRefresh() {
    // Reuse the existing dashboard refresh event to avoid plumbing refs through hooks.
    window.dispatchEvent(new Event(EVT_REFRESH));
  }

  const deployChecklistSecrets = useMemo(() => {
    if (!Array.isArray(deployBootstrapChecks)) return null;
    const groups: Record<DeployBootstrapCheck["group"], DeployBootstrapCheck[]> = {
      required: [],
      bootstrap: [],
      recommended: [],
      optional: [],
    };

    for (const c of deployBootstrapChecks) {
      if (!c) continue;
      groups[c.group].push(c);
    }

    return groups;
  }, [deployBootstrapChecks]);

  const deployChecklistPermissions: ChecklistItem[] = useMemo(() => {
    return [
      {
        id: "store_access",
        ok: runsResp === null ? null : storeOk,
        label: "App can read/write the store",
        detail: (
          <>
            Confirm <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">DAA_DB_URL</code> is set and that the Postgres DB is reachable.           </>
        ),
      },
      {
        id: "admin_exists",
        ok: hasAnyAccounts,
        label: "An admin account exists",
        detail: (
          <>
            On a fresh deploy, set <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">DAA_AUTH_BOOTSTRAP_TOKEN</code> and create the first admin via the dashboard setup or
            <code className="ml-1 rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">/api/daa/auth/bootstrap</code>.
          </>
        ),
      },
    ];
  }, [hasAnyAccounts, runsResp, storeOk]);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Balance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="text-2xl font-semibold">{fmtCurrencyCny(cash)}</div>
          <div className="text-xs text-muted-foreground">Positions: {positionsCount}</div>
          <div className="text-xs text-muted-foreground">Updated: {fmtTime(portfolio?.updatedAt)}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {auth === null ? (
            <Skeleton className="h-6 w-[180px]" />
          ) : (
            <div className="text-sm">
              <span className="font-medium">Auth:</span> {who}
            </div>
          )}
          {auth && auth.ok ? <div className="text-xs text-muted-foreground">Roles: {roles}</div> : null}
          {isRefreshing ? <div className="text-xs text-muted-foreground">Refreshing data...</div> : null}
          {runsResp === null ? (
            <Skeleton className="h-4 w-[220px]" />
          ) : storeOk ? (
            <div className="text-xs text-muted-foreground">Store: OK</div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Store: {String(runsResp?.error ?? "error")}</span>
              <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => requestRefresh()}>
                Retry
              </Button>
            </div>
          )}
          {auth && !auth.ok ? (
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span>Auth: {String(auth.error ?? "error")}</span>
              <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => requestRefresh()}>
                Retry
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Last Sync</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {runsResp === null ? (
            <Skeleton className="h-6 w-[200px]" />
          ) : latestRun ? (
            <>
              <div className="text-sm">
                <span className="font-medium">{latestRun.kind}</span> · {latestRun.status}
              </div>
              <div className="text-xs text-muted-foreground">{fmtTime(latestRun.createdAt)}</div>
            </>
          ) : (
            <div className="space-y-2">
              <div className="text-xs font-medium">Guided first run</div>
              <div className="text-xs text-muted-foreground">No runs yet. Start from Wizard, then run Market/Funds, then review History/Audit.</div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" asChild>
                  <a href="/daa/dashboard?tab=wizard&step=1">1) Open Wizard</a>
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" asChild>
                  <a href="/daa/dashboard?tab=market-funds">2) Run Market/Funds</a>
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" asChild>
                  <a href="/daa/dashboard?tab=dashboard#history-audit">3) Review History/Audit</a>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Deploy</CardTitle>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-7 w-7"
            onClick={() => requestRefresh()}
            disabled={isRefreshing}
            aria-label="Retry deploy status"
            title="Retry deploy status"
          >
            {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent className="space-y-1">
          {deployResp === null ? (
            <>
              <Skeleton className="h-4 w-[220px]" />
              <Skeleton className="h-4 w-[180px]" />
            </>
          ) : deployResp.ok ? (
            <>
              <div className="text-sm">
                <span className="font-medium">Env:</span> {deployEnv || "-"}
              </div>
              <div className="text-xs text-muted-foreground">Node: {nodeEnv || "-"}</div>
              <div className="text-xs text-muted-foreground">Platform: {platform || "-"}</div>
              {sha ? (
                <TooltipProvider>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>Build:</span>
                    <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground" title={sha || ""}>
                      {shaShort || "-"}
                    </code>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => void copyBuildSha()}
                          aria-label="Copy build SHA"
                          title="Copy build SHA"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm p-2 text-xs">
                        <div className="space-y-1">
                          <div className="font-medium">Copy full build SHA</div>
                          <code className="block break-all rounded bg-muted px-2 py-1 text-[11px] text-foreground">{sha}</code>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              ) : null}

              {showDeployBootstrapPanel ? (
                <Alert className="p-3">
                  <AlertTitle className="flex items-center justify-between gap-2 text-xs">
                    <span>Deploy bootstrap</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => void copyDeployBootstrapAll()}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy all
                    </Button>
                  </AlertTitle>
                  <AlertDescription className="text-xs">
                    <div className="text-muted-foreground">
                      Validate your deploy prerequisites (missing/ok) and use the snippets below to bootstrap or fix the server env.
                    </div>

                    <div className="mt-2 space-y-2">
                      {deployPrereqs.map((it) => (
                        <ChecklistRow key={it.id} ok={it.ok} label={it.label} detail={it.detail} />
                      ))}
                    </div>

                    <div className="mt-3 rounded-md border bg-muted/20 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-medium text-foreground">Env vars template</div>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => void copyDeployBootstrapEnvVars()}
                          aria-label="Copy env vars template"
                          title="Copy env vars template"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-[11px] text-foreground">{deployBootstrapEnvVarsText}</pre>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Replace <code>...</code> and <code>YOUR_DOMAIN</code> before using.
                      </div>
                    </div>

                    <div className="mt-2 rounded-md border bg-muted/20 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-medium text-foreground">Shell export snippet</div>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => void copyDeployBootstrapEnvExports()}
                          aria-label="Copy env export snippet"
                          title="Copy env export snippet"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-[11px] text-foreground">{deployBootstrapEnvExportsText}</pre>
                      <div className="mt-1 text-xs text-muted-foreground">Use this for quick local testing (bash/zsh).</div>
                    </div>

                    <details className="mt-3 rounded-md border bg-muted/20 p-2">
                      <summary className="cursor-pointer text-xs font-medium text-foreground">Quick troubleshooting</summary>
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                        <li>
                        </li>
                        <li>
                          No accounts yet: set <code>DAA_AUTH_BOOTSTRAP_TOKEN</code>, then create the first admin via the dashboard (Setup required) or
                          <code className="ml-1 rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">/api/daa/auth/bootstrap</code>.
                        </li>
                        <li>
                          Build SHA missing: set <code>NEXT_PUBLIC_BUILD_SHA</code> during deploy so <code>/api/daa/deploy-status</code> can report it.
                        </li>
                      </ul>
                    </details>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <a
                          href="https://github.com/Jarvis-agent-bot/Dynamic-Asset-Allocation/blob/main/deploy/README.md"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Deploy guide
                        </a>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <a
                          href="https://github.com/Jarvis-agent-bot/Dynamic-Asset-Allocation/blob/main/docs/QUICKSTART.md"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Quickstart
                        </a>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <a
                          href="https://github.com/Jarvis-agent-bot/Dynamic-Asset-Allocation/blob/main/docs/README.md"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Docs
                        </a>
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="text-xs text-muted-foreground">Last updated: {fmtTime(deployResp.serverTime)}</div>
            </>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Deploy: {String(deployResp.error ?? "error")}</div>
              {deployLastOkServerTime ? (
                <div className="text-xs text-muted-foreground">Last updated: {fmtTime(deployLastOkServerTime)}</div>
              ) : null}
              <Button type="button" size="sm" variant="outline" onClick={() => requestRefresh()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Deploy checklist</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void copyDeployBootstrapAll()}>
              <Copy className="mr-2 h-4 w-4" />
              Copy bundle
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void copyDeployBootstrapEnvVars()}>
              Copy env vars
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void copyDeployBootstrapEnvExports()}>
              Copy exports
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {deployResp === null ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-[280px]" />
              <Skeleton className="h-4 w-[220px]" />
            </div>
          ) : deployResp.ok ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-xs font-medium text-foreground">Secrets &amp; env</div>
                {deployChecklistSecrets ? (
                  <div className="space-y-3">
                    {(
                      [
                        ["required", "Required"],
                        ["bootstrap", "Bootstrap (fresh deploy)"],
                        ["recommended", "Recommended"],
                        ["optional", "Optional"],
                      ] as const
                    ).map(([group, title]) => {
                      const items = deployChecklistSecrets[group];
                      if (!items.length) return null;
                      return (
                        <div key={group} className="space-y-2">
                          <div className="text-xs font-medium text-muted-foreground">{title}</div>
                          <div className="space-y-2">
                            {items.map((c) => (
                              <ChecklistRow
                                key={c.id}
                                ok={c.ok}
                                label={c.label}
                                detail={
                                  <>
                                    <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">{c.id}</code>
                                    {c.note ? <span className="ml-1">{c.note}</span> : null}
                                    {Array.isArray(c.candidates) && c.candidates.length ? (
                                      <span className="ml-1">
                                        Candidates:{" "}
                                        {c.candidates.map((n) => (
                                          <code key={n} className="ml-1 rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">
                                            {n}
                                          </code>
                                        ))}
                                      </span>
                                    ) : null}
                                  </>
                                }
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">Deploy status did not include bootstrap checks.</div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium text-foreground">Permissions &amp; runtime</div>
                <div className="space-y-2">
                  {deployChecklistPermissions.map((it) => (
                    <ChecklistRow key={it.id} ok={it.ok} label={it.label} detail={it.detail} />
                  ))}
                </div>

                <details className="rounded-md border bg-muted/20 p-2">
                  <summary className="cursor-pointer text-xs font-medium text-foreground">Notes</summary>
                  <div className="mt-2 text-xs text-muted-foreground">
                    The checklist is for bootstrap safety. It does not grant permissions; you still need to configure your hosting platform and server.
                  </div>
                </details>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Deploy status unavailable: {String(deployResp.error ?? "error")}</div>
              <Button type="button" size="sm" variant="outline" onClick={() => requestRefresh()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
