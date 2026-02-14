"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import Step2MarketEventsPage from "../../step/_pages/Step2MarketEventsPage";
import Step4BaselineRecommendationPage from "../../step/_pages/Step4BaselineRecommendationPage";
import Step6HumanFactorPage from "../../step/_pages/Step6HumanFactorPage";
import Step7TagsPage from "../../step/_pages/Step7TagsPage";

import { DaaWizard } from "../../_components/DaaWizard";

import DaaDashboardAiExplain from "../_components/DaaDashboardAiExplain";
import DaaDashboardExport from "../_components/DaaDashboardExport";
import DaaDashboardImport from "../_components/DaaDashboardImport";
import DaaDashboardRunChecklist from "../_components/DaaDashboardRunChecklist";
import DaaDashboardOverviewCards from "../_components/DaaDashboardOverviewCards";
import DaaDashboardBacktestDriftRebalance from "../_components/DaaDashboardBacktestDriftRebalance";
import DaaDashboardConfirmExecuted from "../_components/DaaDashboardConfirmExecuted";
import DaaDashboardHistoryAudit from "../_components/DaaDashboardHistoryAudit";
import DaaDashboardAdminUsers from "../_components/DaaDashboardAdminUsers";

import DaaMarketFundsTab from "../_tabs/DaaMarketFundsTab";

type Tab = "dashboard" | "wizard" | "market-funds";

function normalizeTab(raw: string | null): Tab {
  if (raw === "wizard") return "wizard";
  if (raw === "market-funds") return "market-funds";
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

function DashboardMain() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">DAA Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Run path: <span className="font-medium text-foreground">Step2 → Step4/5 → Step6 → Step7</span>.
            <span className="hidden sm:inline"> </span>
            Here is the default entry: fill gaps → run → export.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/daa/dashboard?tab=wizard&step=1">Open Wizard</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/daa/dashboard?tab=market-funds">Market/Funds</Link>
          </Button>
        </div>
      </div>

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
  const tab = normalizeTab(searchParams.get("tab"));

  const content =
    tab === "wizard" ? (
      <DaaWizard initialStepId={parseInitialStepId(searchParams.get("step"))} />
    ) : tab === "market-funds" ? (
      <DaaMarketFundsTab />
    ) : (
      <DashboardMain />
    );

  return <div className={tab === "dashboard" ? "space-y-4" : undefined}>{content}</div>;
}
