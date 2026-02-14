import Link from "next/link";
import { Suspense } from "react";
import type React from "react";

import DaaSessionGuard from "./DaaSessionGuard";
import DaaUserMenuDialog from "./DaaUserMenuDialog";
import DaaTopNav from "./DaaTopNav";

type Props = {
  children: React.ReactNode;
};

export default function DaaShell({ children }: Props) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <DaaSessionGuard />
      <header className="mb-6 flex flex-col gap-3 sm:mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <Link
              href="/daa/dashboard"
              className="rounded-sm text-base font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background sm:text-lg"
              aria-label="DAA dashboard"
            >
              Dynamic Asset Allocation
            </Link>
            <div className="text-xs text-muted-foreground sm:text-sm">Console — dashboard-first</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Suspense fallback={null}>
              <DaaTopNav />
            </Suspense>
            <DaaUserMenuDialog />
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
