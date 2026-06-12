"use client";

const chartHeightClassName: Record<number, string> = {
  150: "h-[150px]",
  240: "h-[240px]",
  260: "h-[260px]",
};

export function SkeletonChart({ height = 260 }: { height?: number }) {
  return (
    <div
      className={`w-full animate-pulse rounded-[var(--radius-md)] bg-[var(--border)] ${chartHeightClassName[height] ?? "h-[260px]"}`}
    />
  );
}

export function SkeletonIndicatorGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-[var(--radius-md)] bg-[var(--border)]" />
      ))}
    </div>
  );
}
