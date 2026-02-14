"use client";

import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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

    async function load() {
      // Fetch in parallel; all endpoints are cookie-auth friendly.
      const [authRes, runsRes] = await Promise.allSettled([
        fetch("/api/daa/auth/me", { method: "GET", headers: { accept: "application/json" } }),
        fetch("/api/daa/store/v0/runs?limit=1", { method: "GET", headers: { accept: "application/json" } }),
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
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const who = auth && auth.ok ? auth.account.username : "(not signed in)";
  const roles = auth && auth.ok ? (auth.account.roles || []).join(", ") || "-" : "-";

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
    </div>
  );
}
