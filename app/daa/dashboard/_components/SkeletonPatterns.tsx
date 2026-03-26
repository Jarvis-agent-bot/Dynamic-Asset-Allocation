"use client";

export function SkeletonChart({ height = 260 }: { height?: number }) {
  return <div className="w-full animate-pulse rounded-lg bg-[var(--border)]" style={{ height }} />;
}

export function SkeletonIndicatorGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg bg-[var(--border)]" />
      ))}
    </div>
  );
}
