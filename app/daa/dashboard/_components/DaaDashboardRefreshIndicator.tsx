"use client";

import { useEffect, useMemo, useState } from "react";

import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const EVT_REFRESH = "daa:dashboard:refresh";
const EVT_DATA_UPDATED = "daa:dashboard:data-updated";

function fmtTime(ts: number): string {
  if (!Number.isFinite(ts)) return "-";
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return String(ts);
  }
}

export default function DaaDashboardRefreshIndicator({ compact }: { compact?: boolean }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  // Keep a stable handler identity.
  const onUpdated = useMemo(
    () =>
      (ev: Event) => {
        const ce = ev as CustomEvent<{ ts?: number }>;
        const ts = typeof ce.detail?.ts === "number" ? ce.detail.ts : Date.now();
        setLastUpdatedAt(ts);
        setIsRefreshing(false);
      },
    []
  );

  useEffect(() => {
    window.addEventListener(EVT_DATA_UPDATED, onUpdated);
    return () => {
      window.removeEventListener(EVT_DATA_UPDATED, onUpdated);
    };
  }, [onUpdated]);

  function requestRefresh() {
    setIsRefreshing(true);
    window.dispatchEvent(new CustomEvent(EVT_REFRESH));
  }

  const updatedText = lastUpdatedAt ? `Updated: ${fmtTime(lastUpdatedAt)}` : null;

  if (compact) {
    return (
      <Button type="button" variant="ghost" size="icon" onClick={requestRefresh} aria-label="Refresh dashboard data">
        {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <div className="h-2 w-2 rounded-full bg-emerald-500/60" />}
      {updatedText ? <span className="tabular-nums">{updatedText}</span> : <Skeleton className="h-3 w-24" />}
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={requestRefresh}>
        Refresh
      </Button>
    </div>
  );
}
