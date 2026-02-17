"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";

import { copyTextToClipboard } from "../../copyToClipboard";

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
import { DASHBOARD_VISUAL_SURFACES_V0 } from "./dashboardVisualSurfacesV0";

type Tab = "dashboard" | "wizard" | "market-funds" | "settings";

function normalizeTab(raw: string | null): Tab {
  if (raw === "dashboard") return "dashboard";
  if (raw === "wizard") return "wizard";
  if (raw === "market-funds") return "market-funds";
  if (raw === "settings") return "settings";
  // Keep /daa/dashboard canonical while making market/funds the default hub surface.
  return "market-funds";
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

  const focusTarget = el.querySelector<HTMLElement>("[data-dashboard-section-heading='true']") ?? (el as HTMLElement);
  if (focusTarget && typeof focusTarget.focus === "function") {
    // Keep keyboard users anchored to the section they just jumped to.
    focusTarget.focus({ preventScroll: true });
  }
}

type ActionRailItem = { id: string; label: string };

const ACTION_RAIL_GROUPS: Array<{ title: string; group: "core" | "inputs" | "analysis" }> = [
  { title: "Core operations", group: "core" },
  { title: "Inputs and control", group: "inputs" },
  { title: "Analysis surfaces", group: "analysis" },
];

const ACTION_RAIL_SECTIONS: Array<{ title: string; items: ActionRailItem[] }> = ACTION_RAIL_GROUPS.map(({ title, group }) => ({
  title,
  items: DASHBOARD_VISUAL_SURFACES_V0.filter((surface) => surface.group === group).map((surface) => ({
    id: surface.id,
    label: surface.title,
  })),
}));

const ACTION_RAIL_SHORTCUTS = [
  { href: "/daa/dashboard?tab=wizard&step=1", label: "Open Wizard" },
  { href: "/daa/dashboard?tab=market-funds", label: "Open Market/Funds" },
  { href: "/daa/dashboard/settings", label: "Open Settings" },
] as const;

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
        Default hub surface for DAA. Canonical URL remains <code className="rounded bg-muted px-1 py-0.5">/daa/dashboard</code>; jump to wizard when
        you are ready to run.
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
                <Link href="/daa/dashboard?tab=dashboard">Dashboard</Link>
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

        <div className="rounded-md border border-dashed border-muted-foreground/30 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next actions</div>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
            <li>Sign in with your DAA admin account.</li>
            <li>
              Open <code className="rounded bg-muted px-1 py-0.5">Wizard</code> and complete Step1 to Step7.
            </li>
            <li>Return to Dashboard to confirm and export the latest run.</li>
          </ol>
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
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    try {
      setBaseUrl(window.location.origin);
    } catch {
      // Ignore; will fall back to a placeholder in the CLI snippet.
    }
  }, []);

  const bootstrapCurl = useMemo(() => {
    const base = baseUrl || "https://YOUR_DOMAIN";
    const u = (email || "admin@example.com").trim() || "admin@example.com";
    const payload = JSON.stringify({ username: u, password: "YOUR_PASSWORD" });

    return [
      `curl -sS -X POST "${base}/api/daa/auth/bootstrap" \\`,
      `  -H "accept: application/json" \\`,
      `  -H "content-type: application/json" \\`,
      `  -H "x-daa-bootstrap-token: $DAA_AUTH_BOOTSTRAP_TOKEN" \\`,
      `  --data-binary @- <<'JSON'`,
      payload,
      "JSON",
    ].join("\n");
  }, [baseUrl, email]);

  async function copyBootstrapCurl() {
    try {
      await copyTextToClipboard(bootstrapCurl);
      toast.success("Copied bootstrap command.");
    } catch (e) {
      toast.error(`Copy failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

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
              enterKeyHint="next"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
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

        <div className="rounded-md border border-dashed border-muted-foreground/30 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">First-run checklist</div>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
            <li>
              Confirm <code className="rounded bg-muted px-1 py-0.5">DAA_AUTH_BOOTSTRAP_TOKEN</code> is set on the server.
            </li>
            <li>Create the first admin account with the form above.</li>
            <li>
              Sign in and continue from <code className="rounded bg-muted px-1 py-0.5">/daa/dashboard?tab=wizard&amp;step=1</code>.
            </li>
          </ol>
        </div>

        <div className="rounded-md border border-dashed border-muted-foreground/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-foreground">CLI (optional)</div>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-7 w-7"
              onClick={() => void copyBootstrapCurl()}
              aria-label="Copy bootstrap command"
              title="Copy bootstrap command"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-[11px] text-foreground">{bootstrapCurl}</pre>
          <div className="mt-2 text-xs text-muted-foreground">
            Replace <code className="rounded bg-muted px-1 py-0.5">DAA_AUTH_BOOTSTRAP_TOKEN</code> and <code className="rounded bg-muted px-1 py-0.5">YOUR_PASSWORD</code> before running.
          </div>
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
    <Card className="border-muted-foreground/20" role="status" aria-live="polite" aria-busy="true">
      <CardContent className="space-y-3 py-6">
        <span className="sr-only">Loading DAA dashboard session</span>
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
    <Card className="border-destructive/20" role="alert" aria-live="assertive">
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

function DashboardSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6" aria-labelledby={`${id}-title`} data-visual-surface={id}>
      <h2 id={`${id}-title`} className="sr-only" tabIndex={-1} data-dashboard-section-heading="true">
        {title}
      </h2>
      {children}
    </section>
  );
}

function DashboardSkipLinks({ tab }: { tab: Tab }) {
  if (tab !== "dashboard") return null;

  return (
    <nav aria-label="Skip links" className="flex flex-wrap gap-2">
      <a
        href="#run-checklist"
        className="sr-only rounded-sm border bg-background px-2 py-1 text-xs text-foreground focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Skip to run checklist
      </a>
      <a
        href="#step2"
        className="sr-only rounded-sm border bg-background px-2 py-1 text-xs text-foreground focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Skip to Step2 events
      </a>
      <a
        href="#history-audit"
        className="sr-only rounded-sm border bg-background px-2 py-1 text-xs text-foreground focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Skip to history and audit
      </a>
    </nav>
  );
}

function DashboardActionRail({ compact = false }: { compact?: boolean }) {
  return (
    <Card className={compact ? undefined : "xl:sticky xl:top-20"}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Action rail</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {ACTION_RAIL_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{section.title}</div>
            <div className="grid gap-2">
              {section.items.map((it) => (
                <Button
                  key={it.id}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => scrollToId(it.id)}
                  aria-controls={it.id}
                  className="justify-start"
                >
                  {it.label}
                </Button>
              ))}
            </div>
          </div>
        ))}
        <div className="space-y-2 border-t pt-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cross-tab shortcuts</div>
          <div className="grid gap-2">
            {ACTION_RAIL_SHORTCUTS.map((it) => (
              <Button key={it.href} asChild variant="outline" size="sm" className="justify-start">
                <Link href={it.href}>{it.label}</Link>
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardMain() {
  return (
    <div className="space-y-4">
      <DaaDashboardOverviewCards />

      <div className="xl:hidden">
        <DashboardActionRail compact />
      </div>

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden xl:block">
          <DashboardActionRail />
        </aside>

        <div className="space-y-4">
          <DashboardSection id="run-checklist" title="Run checklist">
            <DaaDashboardRunChecklist onJump={scrollToId} />
          </DashboardSection>

          <DashboardSection id="import" title="Import bundle">
            <DaaDashboardImport />
          </DashboardSection>

          <DashboardSection id="export" title="Export bundle">
            <DaaDashboardExport />
          </DashboardSection>

          <DashboardSection id="confirm-executed" title="Confirm and executed logs">
            <DaaDashboardConfirmExecuted />
          </DashboardSection>

          <DashboardSection id="history-audit" title="History and audit">
            <DaaDashboardHistoryAudit />
          </DashboardSection>

          <DashboardSection id="admin-users" title="Admin users">
            <DaaDashboardAdminUsers />
          </DashboardSection>

          <DashboardSection id="backtest" title="Backtest and drift rebalance">
            <DaaDashboardBacktestDriftRebalance />
          </DashboardSection>

          <DashboardSection id="step2" title="Step2 events">
            <Step2MarketEventsPage />
          </DashboardSection>

          <DashboardSection id="step4" title="Step4 recommendation">
            <Step4BaselineRecommendationPage />
          </DashboardSection>

          <DashboardSection id="step5" title="Step5 explain">
            <DaaDashboardAiExplain />
          </DashboardSection>

          <DashboardSection id="step6" title="Step6 human profile">
            <Step6HumanFactorPage />
          </DashboardSection>

          <DashboardSection id="step7" title="Step7 tags">
            <Step7TagsPage />
          </DashboardSection>

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
      </div>
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
        <DashboardSkipLinks tab={tab} />
        <LoadingState />
      </div>
    );
  }

  if (auth.kind === "signedOut") {
    return (
      <div className="space-y-4">
        {header}
        <DashboardSkipLinks tab={tab} />
        <SignedOutState returnTo={returnTo} />
      </div>
    );
  }

  if (auth.kind === "bootstrapRequired") {
    return (
      <div className="space-y-4">
        {header}
        <DashboardSkipLinks tab={tab} />
        <BootstrapRequiredState returnTo={returnTo} />
      </div>
    );
  }

  if (auth.kind === "error") {
    return (
      <div className="space-y-4">
        {header}
        <DashboardSkipLinks tab={tab} />
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
      <DashboardSkipLinks tab={tab} />
      {content}
    </div>
  );
}
