import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Terms</CardTitle>
          <CardDescription>Basic usage terms for the DAA console.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <div className="grid gap-2">
            <div className="font-medium">Internal tool</div>
            <div className="text-muted-foreground">
              This console is intended for internal/admin use. Access may be revoked at any time.
            </div>
          </div>

          <div className="grid gap-2">
            <div className="font-medium">No auto-execution</div>
            <div className="text-muted-foreground">
              The system may generate draft orders (for review), but it never executes trades automatically.
            </div>
          </div>

          <div className="grid gap-2">
            <div className="font-medium">No warranty</div>
            <div className="text-muted-foreground">
              Outputs are provided "as is" without guarantees. Verify everything before taking action.
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button asChild variant="secondary">
              <Link href="/daa/login">Back to sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/privacy">Privacy</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
