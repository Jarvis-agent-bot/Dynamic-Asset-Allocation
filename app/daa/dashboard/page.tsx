import { Suspense } from "react";

import DaaAssetsPageClient from "./_components/DaaAssetsPageClient";
import DaaDashboardSkeleton from "./_components/DaaDashboardSkeleton";

export default function DaaDashboardPage() {
  // Next.js requires `useSearchParams()` to be behind a Suspense boundary.
  return (
    <Suspense fallback={<DaaDashboardSkeleton />}>
      <DaaAssetsPageClient />
    </Suspense>
  );
}
