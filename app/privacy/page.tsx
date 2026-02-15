import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Privacy</CardTitle>
          <CardDescription>What this app stores and why.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <div className="grid gap-2">
            <div className="font-medium">Email sign-in</div>
            <div className="text-muted-foreground">
              If you request an email sign-in link, the server stores a single-use token hash and its expiry time.
              Tokens are invalid after use or expiry.
            </div>
          </div>

          <div className="grid gap-2">
            <div className="font-medium">Session cookie</div>
            <div className="text-muted-foreground">
              After you sign in, the server sets an HTTP-only session cookie so you can access the dashboard.
            </div>
          </div>

          <div className="grid gap-2">
            <div className="font-medium">Operational logs</div>
            <div className="text-muted-foreground">
              The server may record basic operational metadata (for example, timestamps and error codes) to support debugging.
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button asChild variant="secondary">
              <Link href="/daa/login">Back to sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/terms">Terms</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
