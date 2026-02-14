import Link from "next/link";
import type React from "react";

import { Button } from "@/components/ui/button";

type Props = {
  children: React.ReactNode;
};

export default function DaaShell({ children }: Props) {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-6">
      <header className="mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <Link
              href="/daa/dashboard"
              className="text-lg font-semibold tracking-tight"
              aria-label="DAA dashboard"
            >
              Dynamic Asset Allocation
            </Link>
            <div className="text-sm text-muted-foreground">Console — dashboard-first</div>
          </div>

          <nav className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/daa/dashboard">Dashboard</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/daa/dashboard?tab=wizard&step=1">Wizard</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/daa/dashboard?tab=market-funds">Market/Funds</Link>
            </Button>
          </nav>
        </div>
      </header>

      {children}
    </div>
  );
}
