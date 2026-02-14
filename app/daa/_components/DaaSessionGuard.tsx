"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

function buildLoginHref(returnTo: string): string {
  const safe = returnTo && returnTo.startsWith("/") ? returnTo : "/daa/dashboard";
  return `/daa/login?returnTo=${encodeURIComponent(safe)}&notice=session_expired`;
}

export default function DaaSessionGuard() {
  const pathname = usePathname() || "";
  const redirectingRef = useRef(false);

  useEffect(() => {
    // Only guard DAA pages; let /daa/login be reachable even when signed out.
    if (!pathname.startsWith("/daa")) return;
    if (pathname.startsWith("/daa/login")) return;

    let cancelled = false;

    async function check() {
      if (cancelled || redirectingRef.current) return;

      try {
        const res = await fetch("/api/daa/auth/me", {
          method: "GET",
          headers: { accept: "application/json" },
          cache: "no-store",
        });

        if (cancelled) return;

        if (res.status === 401) {
          redirectingRef.current = true;

          let returnTo = pathname;
          try {
            returnTo = `${window.location.pathname}${window.location.search}`;
          } catch {
            // Ignore access errors (shouldn't happen in normal browsers).
          }

          window.location.href = buildLoginHref(returnTo);
        }
      } catch {
        // Best-effort: network/edge errors shouldn't cause redirect loops.
      }
    }

    void check();

    function onFocus() {
      void check();
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void check();
    }

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [pathname]);

  return null;
}
