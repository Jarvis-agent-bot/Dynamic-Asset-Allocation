"use client";

import { Loader2 } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Props = {
  returnTo: string;
};

type FormErrors = {
  email?: string;
  password?: string;
  form?: string;
};

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

function normalizeReturnTo(raw: string): string {
  const v = raw.trim();
  if (!v) return "/daa/dashboard";
  if (!v.startsWith("/")) return "/daa/dashboard";
  if (v.startsWith("//")) return "/daa/dashboard";

  // Keep post-login redirects inside the DAA surface.
  if (!v.startsWith("/daa")) return "/daa/dashboard";

  return v;
}

export default function DaaLoginClient({ returnTo }: Props) {
  const usernameId = useId();
  const passwordId = useId();

  const emailHelpId = useId();
  const passwordHelpId = useId();
  const formErrorId = useId();

  const safeReturnTo = useMemo(() => normalizeReturnTo(returnTo), [returnTo]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  async function submit() {
    setBusy(true);
    setErrors({});

    const email = normalizeEmailLoose(username);
    const pwd = password;

    const nextErrors: FormErrors = {};
    if (!email) nextErrors.email = "Enter a valid email address.";
    if (!pwd.trim()) nextErrors.password = "Password is required.";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setBusy(false);
      return;
    }

    try {
      const res = await fetch("/api/daa/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ username: email, password: pwd }),
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
        setErrors({ form: msg });
        return;
      }

      // Cookie is set by the server; redirect into the console.
      window.location.href = safeReturnTo;
    } catch (e) {
      setErrors({ form: e instanceof Error ? e.message : String(e) });
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
            aria-busy={busy}
            aria-describedby={errors.form ? formErrorId : undefined}
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
                onChange={(e) => {
                  setUsername(e.target.value);
                  setErrors((prev) => ({ ...prev, email: undefined, form: undefined }));
                }}
                autoComplete="email"
                placeholder="you@example.com"
                disabled={busy}
                aria-invalid={Boolean(errors.email) || undefined}
                aria-describedby={errors.email ? emailHelpId : undefined}
              />
              {errors.email ? (
                <div id={emailHelpId} className="text-xs text-destructive">
                  {errors.email}
                </div>
              ) : null}
            </div>

            <div className="grid gap-2">
              <label htmlFor={passwordId} className="text-sm font-medium">
                Password
              </label>
              <Input
                id={passwordId}
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrors((prev) => ({ ...prev, password: undefined, form: undefined }));
                }}
                autoComplete="current-password"
                placeholder="••••••••"
                disabled={busy}
                aria-invalid={Boolean(errors.password) || undefined}
                aria-describedby={errors.password ? passwordHelpId : undefined}
              />
              {errors.password ? (
                <div id={passwordHelpId} className="text-xs text-destructive">
                  {errors.password}
                </div>
              ) : null}
            </div>

            <Button type="submit" disabled={busy}>
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </span>
              ) : (
                "Sign in"
              )}
            </Button>

            {errors.form ? (
              <div
                id={formErrorId}
                role="alert"
                className="grid gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <div>Login failed: {errors.form}</div>
                <div className="text-xs text-muted-foreground">
                  If this is a fresh deployment, bootstrap the first admin via{" "}
                  <code className="rounded bg-muted px-1 py-0.5">/api/daa/auth/bootstrap</code> (requires server env{" "}
                  <code className="rounded bg-muted px-1 py-0.5">DAA_AUTH_BOOTSTRAP_TOKEN</code> and sending{" "}
                  <code className="rounded bg-muted px-1 py-0.5">x-daa-bootstrap-token</code>.
                </div>
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

