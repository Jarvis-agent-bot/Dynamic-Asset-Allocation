"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

import Step2MarketEventsPage from "../../step/_pages/Step2MarketEventsPage";
import Step4BaselineRecommendationPage from "../../step/_pages/Step4BaselineRecommendationPage";
import Step6HumanFactorPage from "../../step/_pages/Step6HumanFactorPage";
import Step7TagsPage from "../../step/_pages/Step7TagsPage";

import { DaaWizard } from "../../_components/DaaWizard";

import DaaDashboardAdminUsers from "../_components/DaaDashboardAdminUsers";
import DaaDashboardAiExplain from "../_components/DaaDashboardAiExplain";
import DaaDashboardBacktestDriftRebalance from "../_components/DaaDashboardBacktestDriftRebalance";
import DaaDashboardConfirmExecuted from "../_components/DaaDashboardConfirmExecuted";
import DaaDashboardExport from "../_components/DaaDashboardExport";
import DaaDashboardHistoryAudit from "../_components/DaaDashboardHistoryAudit";
import DaaDashboardImport from "../_components/DaaDashboardImport";
import DaaDashboardOverviewCards from "../_components/DaaDashboardOverviewCards";
import DaaDashboardRunChecklist from "../_components/DaaDashboardRunChecklist";

import DaaMarketFundsTab from "../_tabs/DaaMarketFundsTab";
import DaaSettingsTab from "../_tabs/DaaSettingsTab";

type Tab = "dashboard" | "wizard" | "market-funds" | "settings";

function normalizeTab(raw: string | null): Tab {
  if (raw === "wizard") return "wizard";
  if (raw === "market-funds") return "market-funds";
  if (raw === "settings") return "settings";
  return "dashboard";
}

function parseInitialStepId(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const t = Math.trunc(n);
  return t > 0 ? t : undefined;
}

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

const QUICK_NAV: Array<{ id: string; label: string }> = [
  { id: "import", label: "Import" },
  { id: "export", label: "Export" },
  { id: "confirm-executed", label: "Confirm/Executed" },
  { id: "history-audit", label: "History/Audit" },
  { id: "admin-users", label: "Admin Users" },
  { id: "backtest", label: "Backtest" },
  { id: "step2", label: "Step2 — Events" },
  { id: "step4", label: "Step4 — Recommendation" },
  { id: "step5", label: "Step5 — Explain" },
  { id: "step6", label: "Step6 — Human" },
  { id: "step7", label: "Step7 — Tags" },
];

type MeResponse =
  | {
      ok: true;
      account: { accountId: string; username: string; roles: string[]; status: string };
      session: {
        sessionId: string;
        createdAt: string;
        expiresAt: string;
        revokedAt: string | null;
        lastSeenAt: string | null;
      };
    }
  | { ok: false; error: string };

type AuthModel =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "bootstrapRequired" }
  | { kind: "error"; message: string }
  | { kind: "signedIn"; me: Extract<MeResponse, { ok: true }> };

function DaaDashboardHeader({ tab, stepId }: { tab: Tab; stepId?: number }) {
  const title = tab === "wizard" ? "Wizard" : tab === "market-funds" ? "Market/Funds" : tab === "settings" ? "Settings" : "Dashboard";

  const desc =
    tab === "wizard" ? (
      <>
        Canonical URL: <code className="rounded bg-muted px-1 py-0.5">/daa/dashboard?tab=wizard&amp;step=...</code>. Use the steps to produce{" "}
        <code className="rounded bg-muted px-1 py-0.5">ai_orders_draft</code> (never auto-trade).
      </>
    ) : tab === "market-funds" ? (
      <>
        Legacy market/funds tools, now hosted under <code className="rounded bg-muted px-1 py-0.5">/daa/dashboard</code> to avoid fragmented
        deep-links.
      </>
    ) : tab === "settings" ? (
      <>
        Account and session details for DAA. Canonical entry remains <code className="rounded bg-muted px-1 py-0.5">/daa/dashboard</code>.
      </>
    ) : (
      <>
        Run path: <span className="font-medium text-foreground">Step2 → Step4/5 → Step6 → Step7</span>. Fill gaps → run → export.
      </>
    );

  return (
    <div className="space-y-3">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/daa/dashboard">DAA</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {tab === "wizard" && stepId ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href={`/daa/dashboard?tab=wizard&step=${stepId}`}>Wizard</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{`Step ${stepId}`}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : (
            <BreadcrumbItem>
              <BreadcrumbPage>{title}</BreadcrumbPage>
            </BreadcrumbItem>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title={title}
        description={desc}
        actions={
          <>
            {tab !== "dashboard" ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/daa/dashboard">Dashboard</Link>
              </Button>
            ) : null}
            {tab !== "wizard" ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/daa/dashboard?tab=wizard&step=1">Open Wizard</Link>
              </Button>
            ) : null}
            {tab !== "market-funds" ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/daa/dashboard?tab=market-funds">Market/Funds</Link>
              </Button>
            ) : null}
            {tab !== "settings" ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/daa/dashboard/settings">Settings</Link>
              </Button>
            ) : null}
          </>
        }
      />
    </div>
  );
}

function SignedOutState({ returnTo }: { returnTo: string }) {
  return (
    <Card className="border-muted-foreground/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Sign in required</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">You are signed out (or your session expired). Sign in to continue.</div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/daa/login?returnTo=${encodeURIComponent(returnTo)}`}>Sign in</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/daa/login">Open login</Link>
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          Tip: <code className="rounded bg-muted px-1 py-0.5">/daa/dashboard</code> is the canonical DAA entry point; legacy <code className="rounded bg-muted px-1 py-0.5">/daa*</code> routes redirect here.
        </div>
      </CardContent>
    </Card>
  );
}

function BootstrapRequiredState({ returnTo }: { returnTo: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      const res = await fetch("/api/daa/auth/bootstrap", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-daa-bootstrap-token": bootstrapToken,
        },
        body: JSON.stringify({ username: email, password }),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      if (!res.ok) {
        setError(String(json?.error ?? `HTTP ${res.status}`));
        return;
      }

      if (!json?.ok) {
        setError(String(json?.error ?? "bootstrap failed"));
        return;
      }

      toast.success("First admin created. Please sign in.");
      window.location.href = `/daa/login?returnTo=${encodeURIComponent(returnTo)}&notice=bootstrapped`;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-muted-foreground/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Setup required</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          No DAA admin accounts exist yet (fresh deployment). Create the first admin using the server bootstrap token.
        </div>

        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="daa-bootstrap-email">Admin email</Label>
            <Input
              id="daa-bootstrap-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="grid gap-1">
            <Label htmlFor="daa-bootstrap-password">Admin password</Label>
            <Input
              id="daa-bootstrap-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="grid gap-1">
            <Label htmlFor="daa-bootstrap-token">Bootstrap token</Label>
            <Input
              id="daa-bootstrap-token"
              type="password"
              autoComplete="off"
              placeholder="DAA_AUTH_BOOTSTRAP_TOKEN"
              value={bootstrapToken}
              onChange={(e) => setBootstrapToken(e.target.value)}
            />
          </div>
        </div>

        {error ? <div className="text-sm text-destructive">{error}</div> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void submit()} disabled={busy}>
            {busy ? "Creating..." : "Create first admin"}
          </Button>
          <Button asChild type="button" variant="outline" disabled={busy}>
            <Link href="/daa/login">Open login</Link>
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">
          This is only available when there are zero accounts, and requires the server env <code className="rounded bg-muted px-1 py-0.5">DAA_AUTH_BOOTSTRAP_TOKEN</code>.
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <Card className="border-muted-foreground/20">
      <CardContent className="space-y-3 py-6">
        <Skeleton className="h-5 w-[220px]" />
        <Skeleton className="h-4 w-[420px]" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-[120px]" />
          <Skeleton className="h-9 w-[120px]" />
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-destructive/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Session unavailable</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">{message}</div>
        <Button type="button" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

function DashboardMain() {
  return (
    <div className="space-y-4">
      <DaaDashboardOverviewCards />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Quick nav</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {QUICK_NAV.map((it) => (
            <Button
              key={it.id}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => scrollToId(it.id)}
              className="justify-start"
            >
              {it.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <DaaDashboardRunChecklist onJump={scrollToId} />

      <section id="import" className="scroll-mt-6">
        <DaaDashboardImport />
      </section>

      <section id="export" className="scroll-mt-6">
        <DaaDashboardExport />
      </section>

      <section id="confirm-executed" className="scroll-mt-6">
        <DaaDashboardConfirmExecuted />
      </section>

      <section id="history-audit" className="scroll-mt-6">
        <DaaDashboardHistoryAudit />
      </section>

      <section id="admin-users" className="scroll-mt-6">
        <DaaDashboardAdminUsers />
      </section>

      <section id="backtest" className="scroll-mt-6">
        <DaaDashboardBacktestDriftRebalance />
      </section>

      <section id="step2" className="scroll-mt-6">
        <Step2MarketEventsPage />
      </section>

      <section id="step4" className="scroll-mt-6">
        <Step4BaselineRecommendationPage />
      </section>

      <section id="step5" className="scroll-mt-6">
        <DaaDashboardAiExplain />
      </section>

      <section id="step6" className="scroll-mt-6">
        <Step6HumanFactorPage />
      </section>

      <section id="step7" className="scroll-mt-6">
        <Step7TagsPage />
      </section>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Tips</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-disc space-y-1 pl-5">
            <li>Step4 recommendations persist to localStorage; Step5 explain and export load them automatically.</li>
            <li>Multiple tabs attempt to revalidate via the storage event for best-effort sync.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DaaDashboardPageClient() {
  const searchParams = useSearchParams();
  const notice = searchParams.get("notice");

  useEffect(() => {
    const n = String(notice || "").trim();
    if (!n) return;

    if (n === "signed_in") {
      toast.success("Signed in.");
    }

    // Avoid repeating the toast on refresh/back.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("notice");
      window.history.replaceState({}, "", url.toString());
    } catch {
      // Ignore URL parsing / history errors.
    }
  }, [notice]);

  const tab = normalizeTab(searchParams.get("tab"));
  const stepId = tab === "wizard" ? parseInitialStepId(searchParams.get("step")) : undefined;

  const [auth, setAuth] = useState<AuthModel>({ kind: "loading" });
  const [authRev, setAuthRev] = useState(0);

  const authRefreshInFlightRef = useRef(false);
  const lastAuthRefreshAtRef = useRef(0);

  // Refresh session state when the user returns to the tab (avoid stale signed-in UI).
  useEffect(() => {
    function requestRefresh() {
      const now = Date.now();
      if (authRefreshInFlightRef.current) return;
      if (now - lastAuthRefreshAtRef.current < 2500) return;

      lastAuthRefreshAtRef.current = now;
      authRefreshInFlightRef.current = true;
      setAuthRev((x) => x + 1);
    }

    function onFocus() {
      requestRefresh();
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") requestRefresh();
    }

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const returnTo = useMemo(() => {
    if (typeof window === "undefined") return "/daa/dashboard";
    return `${window.location.pathname}${window.location.search}`;
  }, [tab, stepId, authRev]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      authRefreshInFlightRef.current = true;
      lastAuthRefreshAtRef.current = Date.now();

      try {
        const res = await fetch("/api/daa/auth/me", {
          method: "GET",
          headers: { accept: "application/json" },
          cache: "no-store",
        });

        const text = await res.text();
        let json: any = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }

        if (cancelled) return;

        if (res.status === 401) {
          const err = String(json?.error ?? "");
          if (err === "bootstrap_required") {
            setAuth({ kind: "bootstrapRequired" });
            return;
          }

          setAuth({ kind: "signedOut" });
          return;
        }

        if (!res.ok) {
          setAuth({ kind: "error", message: String(json?.error ?? `HTTP ${res.status}`) });
          return;
        }

        const payload = json as MeResponse;
        if (!payload?.ok) {
          setAuth({ kind: "signedOut" });
          return;
        }

        setAuth({ kind: "signedIn", me: payload });
      } catch (e) {
        if (cancelled) return;
        setAuth({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        authRefreshInFlightRef.current = false;
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [authRev]);

  const header = <DaaDashboardHeader tab={tab} stepId={stepId} />;

  if (auth.kind === "loading") {
    return (
      <div className="space-y-4">
        {header}
        <LoadingState />
      </div>
    );
  }

  if (auth.kind === "signedOut") {
    return (
      <div className="space-y-4">
        {header}
        <SignedOutState returnTo={returnTo} />
      </div>
    );
  }

  if (auth.kind === "bootstrapRequired") {
    return (
      <div className="space-y-4">
        {header}
        <BootstrapRequiredState returnTo={returnTo} />
      </div>
    );
  }

  if (auth.kind === "error") {
    return (
      <div className="space-y-4">
        {header}
        <ErrorState message={auth.message} onRetry={() => setAuthRev((x) => x + 1)} />
      </div>
    );
  }

  const content =
    tab === "wizard" ? (
      <DaaWizard initialStepId={stepId} />
    ) : tab === "market-funds" ? (
      <DaaMarketFundsTab />
    ) : tab === "settings" ? (
      <DaaSettingsTab me={auth.me} returnTo={returnTo} />
    ) : (
      <DashboardMain />
    );

  return (
    <div className="space-y-4">
      {header}
      {content}
    </div>
  );
}
