import { Suspense } from "react";

import DaaDashboardPageClient from "./_components/DaaDashboardPageClient";
import DaaDashboardSkeleton from "./_components/DaaDashboardSkeleton";

export default function DaaDashboardPage() {
  // Next.js requires `useSearchParams()` to be behind a Suspense boundary.
  return (
    <Suspense fallback={<DaaDashboardSkeleton />}>
      <DaaDashboardPageClient />
    </Suspense>
  );
}
