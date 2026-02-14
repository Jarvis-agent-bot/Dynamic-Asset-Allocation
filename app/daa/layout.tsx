import type { Metadata } from "next";
import Link from "next/link";
import type React from "react";

export const metadata: Metadata = {
  title: "DAA Console",
};

type Props = {
  children: React.ReactNode;
};

export default function DaaLayout({ children }: Props) {
  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto" }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/daa/dashboard" style={{ textDecoration: "none", color: "#111" }} aria-label="DAA dashboard">
          <strong>Dynamic Asset Allocation</strong>
        </Link>
        <div style={{ fontSize: 12, color: "#666" }}>Console (v1) — dashboard-first</div>
        <div style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
          <Link href="/daa/dashboard" style={{ color: "#111" }}>
            Dashboard
          </Link>
          <Link href="/daa/dashboard?tab=wizard&step=1" style={{ color: "#111" }}>
            Wizard
          </Link>
          <Link href="/daa/dashboard?tab=market-funds" style={{ color: "#111" }}>
            Market/Funds
          </Link>
        </div>
      </div>
      {children}
    </div>
  );
}
