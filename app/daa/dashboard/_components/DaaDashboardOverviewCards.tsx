"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";

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

  const deployEnv = deployResp && deployResp.ok ? deployResp.env.deployEnv : "";
  const nodeEnv = deployResp && deployResp.ok ? deployResp.env.nodeEnv : "";
  const platform = deployResp && deployResp.ok ? deployResp.env.platform : "";
  const sha = deployResp && deployResp.ok ? String(deployResp.build.sha ?? "").trim() : "";
  const shaShort = deployResp && deployResp.ok ? deployResp.build.shaShort : "";

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
              <TooltipProvider>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Build:</span>
                  <code
                    className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground"
                    title={sha || ""}
                  >
                    {shaShort || "-"}
                  </code>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        disabled={!sha}
                        onClick={() => void copyBuildSha()}
                        aria-label="Copy build SHA"
                        title="Copy build SHA"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm p-2 text-xs">
                      {sha ? (
                        <div className="space-y-1">
                          <div className="font-medium">Copy full build SHA</div>
                          <code className="block break-all rounded bg-muted px-2 py-1 text-[11px] text-foreground">{sha}</code>
                        </div>
                      ) : (
                        "No build SHA available"
                      )}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
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
