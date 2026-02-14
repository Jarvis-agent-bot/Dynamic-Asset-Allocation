"use client";

import { useState } from "react";

type Props = {
  returnTo: string;
};

export default function DaaLoginClient({ returnTo }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/daa/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ username, password }),
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
    <div style={{ maxWidth: 420 }}>
      <h1 style={{ fontSize: 18, margin: 0 }}>DAA Login</h1>
      <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>Sign in to access the /daa/dashboard console.</div>

      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Username</div>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            style={{ padding: "10px 12px", border: "1px solid #e5e5e5", borderRadius: 10, fontSize: 13 }}
            placeholder="admin"
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Password</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={{ padding: "10px 12px", border: "1px solid #e5e5e5", borderRadius: 10, fontSize: 13 }}
            placeholder="••••••••"
          />
        </label>

        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {busy ? "Signing in..." : "Sign in"}
        </button>

        {error ? (
          <div style={{ fontSize: 12, color: "#a8071a" }}>
            Login failed: {error}
            <div style={{ marginTop: 6, color: "#666" }}>
              If this is a fresh deployment, create an account via <code>/api/daa/auth/bootstrap</code> (admin-only).
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
