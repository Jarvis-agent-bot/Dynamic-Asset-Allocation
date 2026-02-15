"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle, Copy } from "lucide-react";

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

type DeployStatusOk = {
  ok: true;
  env: { nodeEnv: string; deployEnv: string; platform: string };
  build: { sha: string; shaShort: string };
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

    async function load(opts?: { reset?: boolean }) {
      const reset = !!opts?.reset;
      if (reset) {
        // Re-trigger skeletons while refreshing.
        setAuth(null);
        setRunsResp(null);
        setDeployResp(null);
      }

      // Fetch in parallel; all endpoints are cookie-auth friendly.
      const [authRes, runsRes, deployRes] = await Promise.allSettled([
        fetch("/api/daa/auth/me", { method: "GET", headers: { accept: "application/json" } }),
        fetch("/api/daa/store/v0/runs?limit=1", { method: "GET", headers: { accept: "application/json" } }),
        fetch("/api/daa/deploy-status", { method: "GET", headers: { accept: "application/json" } }),
      ]);

      if (!cancelled) {
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
            setDeployResp((await deployRes.value.json()) as DeployStatusResp);
          } catch {
            setDeployResp({ ok: false, error: "invalid_json" });
          }
        } else {
          setDeployResp({ ok: false, error: String(deployRes.reason ?? "fetch_failed") });
        }

        window.dispatchEvent(new CustomEvent(EVT_DATA_UPDATED, { detail: { ts: Date.now() } }));
      }
    }

    const onRefresh = () => {
      void load({ reset: true });
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

  const deployPrereqs: ChecklistItem[] = useMemo(() => {
    return [
      {
        id: "store",
        ok: runsResp === null ? null : storeOk,
        label: "SQLite store reachable",
        detail: (
          <>
            Expect <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">DAA_SQLITE_PATH</code> to be set
            (e.g. <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">/var/lib/daa/daa.sqlite</code>).
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
            <>
              If this is a fresh deploy, set <code className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">DAA_AUTH_BOOTSTRAP_TOKEN</code> on the server.
            </>
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
  }, [deployEnv, hasAnyAccounts, runsResp, sha, storeOk]);

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
          {runsResp === null ? (
            <Skeleton className="h-4 w-[220px]" />
          ) : storeOk ? (
            <div className="text-xs text-muted-foreground">Store: OK</div>
          ) : (
            <div className="text-xs text-muted-foreground">Store: {String(runsResp?.error ?? "error")}</div>
          )}
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
            <div className="text-xs text-muted-foreground">No runs yet</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Deploy</CardTitle>
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
              ) : (
                <div className="rounded-md border border-dashed border-muted-foreground/30 p-2">
                  <div className="text-xs font-medium text-foreground">Deploy bootstrap</div>
                  <div className="mt-1 space-y-2">
                    {deployPrereqs.map((it) => (
                      <ChecklistRow key={it.id} ok={it.ok} label={it.label} detail={it.detail} />
                    ))}
                  </div>
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
                </div>
              )}
              <div className="text-xs text-muted-foreground">Server: {fmtTime(deployResp.serverTime)}</div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">Deploy: {String(deployResp.error ?? "error")}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
