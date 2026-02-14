import Link from "next/link";
import type React from "react";

import { Button } from "@/components/ui/button";

import DaaUserMenuDialog from "./DaaUserMenuDialog";

type Props = {
  children: React.ReactNode;
};

export default function DaaShell({ children }: Props) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex flex-col gap-3 sm:mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <Link href="/daa/dashboard" className="text-base font-semibold tracking-tight sm:text-lg" aria-label="DAA dashboard">
              Dynamic Asset Allocation
            </Link>
            <div className="text-xs text-muted-foreground sm:text-sm">Console — dashboard-first</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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

            <DaaUserMenuDialog />
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
