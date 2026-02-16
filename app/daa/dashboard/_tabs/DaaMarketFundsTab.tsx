"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { DaaRebalancePanel } from "../../market/funds/_components/DaaRebalancePanel";

export default function DaaMarketFundsTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Market/Funds is the default hub</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0 text-sm text-muted-foreground">
          <div>
            Canonical entry stays <code className="rounded bg-muted px-1 py-0.5">/daa/dashboard</code>. Use this hub for market checks, then jump
            into the run workflow when you are ready.
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/daa/dashboard?tab=wizard&step=1">Open Run Workflow</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/daa/dashboard?tab=dashboard">Open Dashboard Checklist</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <DaaRebalancePanel />
    </div>
  );
}
