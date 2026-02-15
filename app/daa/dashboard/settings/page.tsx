import { Suspense } from "react";

import DaaDashboardSkeleton from "../_components/DaaDashboardSkeleton";

import DaaDashboardSettingsPageClient from "./_components/DaaDashboardSettingsPageClient";

export default function DaaDashboardSettingsPage() {
  // Next.js requires `useSearchParams()` to be behind a Suspense boundary.
  return (
    <Suspense fallback={<DaaDashboardSkeleton />}>
      <DaaDashboardSettingsPageClient />
    </Suspense>
  );
}
