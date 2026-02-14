import { Suspense } from "react";

import DaaDashboardPageClient from "./_components/DaaDashboardPageClient";

export default function DaaDashboardPage() {
  // Next.js requires `useSearchParams()` to be behind a Suspense boundary.
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading dashboard...</div>}>
      <DaaDashboardPageClient />
    </Suspense>
  );
}
