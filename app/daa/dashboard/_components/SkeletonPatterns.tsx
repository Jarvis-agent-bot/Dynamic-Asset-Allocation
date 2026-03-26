"use client";

export function SkeletonMetricCard() {
  return (
    <div className="space-y-2 p-4">
      <div className="h-3 w-16 animate-pulse rounded bg-[var(--border)]" />
      <div className="h-6 w-28 animate-pulse rounded bg-[var(--border)]" />
    </div>
  );
}

export function SkeletonChart({ height = 260 }: { height?: number }) {
  return <div className="w-full animate-pulse rounded-lg bg-[var(--border)]" style={{ height }} />;
}

export function SkeletonPieChart() {
  return <div className="mx-auto h-48 w-48 animate-pulse rounded-full bg-[var(--border)]" />;
}

export function SkeletonCardList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-16 w-full animate-pulse rounded-lg bg-[var(--border)]" />
      ))}
    </div>
  );
}

export function SkeletonIndicatorGrid({ cols = 3, count = 6 }: { cols?: number; count?: number }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg bg-[var(--border)]" />
      ))}
    </div>
  );
}
