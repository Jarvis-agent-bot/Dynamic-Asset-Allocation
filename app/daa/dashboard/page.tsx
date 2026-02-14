import { Suspense } from "react";

import DaaDashboardPageClient from "./_components/DaaDashboardPageClient";

export default function DaaDashboardPage() {
  // Next.js requires `useSearchParams()` to be behind a Suspense boundary.
  return (
    <Suspense fallback={<div style={{ padding: 16, color: "#666" }}>Loading dashboard...</div>}>
      <DaaDashboardPageClient />
    </Suspense>
  );
}
