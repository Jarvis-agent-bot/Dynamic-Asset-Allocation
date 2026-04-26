import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DAA_BRAND_NAME } from "@/src/daa/brand";

const ISSUES_URL = "https://github.com/Jarvis-agent-bot/Dynamic-Asset-Allocation/issues";

export default function SupportPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Support</CardTitle>
          <CardDescription>Ways to get help signing in or using {DAA_BRAND_NAME}.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <div className="grid gap-2">
            <div className="font-medium">Sign-in problems</div>
            <div className="text-muted-foreground">
              If a sign-in link is expired/invalid, request a new link from the login page. If you do not have access,
              ask an admin to create or re-issue your account.
            </div>
          </div>

          <div className="grid gap-2">
            <div className="font-medium">Bug reports</div>
            <div className="text-muted-foreground">
              Please file an issue with steps to reproduce.
            </div>
            <div>
              <a className="underline underline-offset-2" href={ISSUES_URL} target="_blank" rel="noreferrer">
                {ISSUES_URL}
              </a>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button asChild variant="secondary">
              <Link href="/daa/login">Back to sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/terms">Terms</Link>
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
