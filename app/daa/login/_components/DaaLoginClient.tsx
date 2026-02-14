"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Props = {
  returnTo: string;
};

export default function DaaLoginClient({ returnTo }: Props) {
  const usernameId = useId();
  const passwordId = useId();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function normalizeEmailLoose(raw: string): string {
    const v = raw.trim().toLowerCase();
    if (!v) return "";
    if (v.length > 254) return "";
    if (/\s/.test(v)) return "";

    const at = v.indexOf("@");
    if (at <= 0 || at !== v.lastIndexOf("@")) return "";

    const domain = v.slice(at + 1);
    if (!domain || domain.startsWith(".") || domain.endsWith(".")) return "";
    if (!domain.includes(".")) return "";

    return v;
  }

  async function submit() {
    setBusy(true);
    setError(null);

    const email = normalizeEmailLoose(username);
    if (!email) {
      setError("invalid email");
      setBusy(false);
      return;
    }

    try {
      const res = await fetch("/api/daa/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ username: email, password }),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      if (!res.ok || !json?.ok) {
        const msg = String(json?.error ?? `HTTP ${res.status}`);
        setError(msg);
        return;
      }

      // Cookie is set by the server; redirect into the console.
      window.location.href = returnTo || "/daa/dashboard";
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">DAA Login</CardTitle>
          <CardDescription>Sign in to access the /daa/dashboard console.</CardDescription>
        </CardHeader>

        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="grid gap-2">
              <label htmlFor={usernameId} className="text-sm font-medium">
                Email
              </label>
              <Input
                id={usernameId}
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                disabled={busy}
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor={passwordId} className="text-sm font-medium">
                Password
              </label>
              <Input
                id={passwordId}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                disabled={busy}
              />
            </div>

            <Button type="submit" disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </Button>

            {error ? (
              <div role="alert" className="grid gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <div>Login failed: {error}</div>
                <div className="text-xs text-muted-foreground">
                  If this is a fresh deployment, create an account via{" "}
                  <code className="rounded bg-muted px-1 py-0.5">/api/daa/auth/bootstrap</code> (admin-only).
                </div>
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
