"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DaaDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Ensure the error is visible in DevTools; UI should remain user-friendly.
    // eslint-disable-next-line no-console
    console.error("/daa/dashboard route error:", error);
  }, [error]);

  return (
    <div className="space-y-4">
      <Card className="border-destructive/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Dashboard crashed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Something went wrong while rendering <code className="rounded bg-muted px-1 py-0.5">/daa/dashboard</code>. You can retry safely.
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={reset}>
              Retry
            </Button>
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              Reload page
            </Button>
            <Button asChild type="button" variant="ghost">
              <Link href="/daa/dashboard">Back to dashboard</Link>
            </Button>
          </div>

          <Alert variant="destructive">
            <AlertTitle>Details</AlertTitle>
            <AlertDescription>
              <div className="break-words font-mono text-xs">{error.message || String(error)}</div>
              {error.digest ? <div className="mt-1 font-mono text-xs opacity-80">digest: {error.digest}</div> : null}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
