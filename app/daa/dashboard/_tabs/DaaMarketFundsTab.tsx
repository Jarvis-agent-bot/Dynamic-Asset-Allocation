"use client";

import { Card, CardContent } from "@/components/ui/card";

import { DaaRebalancePanel } from "../../market/funds/_components/DaaRebalancePanel";

export default function DaaMarketFundsTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Legacy Market/Funds tools are hosted under <code className="rounded bg-muted px-1 py-0.5">/daa/dashboard</code> to avoid fragmented deep-links.
        </CardContent>
      </Card>

      <DaaRebalancePanel />
    </div>
  );
}
