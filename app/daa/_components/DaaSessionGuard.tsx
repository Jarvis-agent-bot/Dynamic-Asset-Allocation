"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { fetchDaaAuthSessionV1 } from "./daaAuthSessionClientV1";

const SESSION_EXPIRED_NOTICE_AT_KEY = "daa_notice_session_expired_at_v0";
const SESSION_EXPIRED_REDIRECT_DELAY_MS = 650;
const DAA_DASHBOARD_PERSIST_ERROR_EVENT_V1 = "daa:dashboard:persist-error";

function buildLoginHref(returnTo: string): string {
  const safe = returnTo && returnTo.startsWith("/") ? returnTo : "/daa/dashboard";
  return `/daa/login?returnTo=${encodeURIComponent(safe)}&notice=session_expired`;
}

export default function DaaSessionGuard() {
  const pathname = usePathname() || "";
  const redirectingRef = useRef(false);
  const toastShownRef = useRef(false);

  useEffect(() => {
    // Only guard DAA pages; let /daa/login be reachable even when signed out.
    if (!pathname.startsWith("/daa")) return;
    if (pathname.startsWith("/daa/login")) return;

    // /daa/dashboard is the public entry point; show a friendly sign-in empty state
    // instead of force-redirecting away. Other /daa/* deep-links remain guarded.
    if (pathname === "/daa/dashboard" || pathname === "/daa/dashboard/") return;

    let cancelled = false;

    async function check() {
      if (cancelled || redirectingRef.current) return;

      try {
        const result = await fetchDaaAuthSessionV1({
          silent: true,
          force: true,
          cacheTtlMs: 0,
        });
        if (cancelled) return;

        if (result.kind === "signedOut") {
          redirectingRef.current = true;

          let returnTo = pathname;
          try {
            returnTo = `${window.location.pathname}${window.location.search}`;
          } catch {
            // Ignore access errors (should not happen in normal browsers).
          }

          // Show a toast *before* navigating away, so the user understands why they were bounced.
          // We also stash a timestamp so /daa/login can avoid double-toasting on arrival.
          if (!toastShownRef.current) {
            toastShownRef.current = true;
            try {
              sessionStorage.setItem(SESSION_EXPIRED_NOTICE_AT_KEY, String(Date.now()));
            } catch {
              // Ignore storage errors (private mode / quota).
            }
            toast.error("会话已过期，请重新登录。");
          }

          const href = buildLoginHref(returnTo);
          window.setTimeout(() => {
            window.location.href = href;
          }, SESSION_EXPIRED_REDIRECT_DELAY_MS);
        }
      } catch {
        // Best-effort: network/edge errors should not cause redirect loops.
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

  useEffect(() => {
    function onPersistError(event: Event) {
      const custom = event as CustomEvent<{ message?: string }>;
      const message = String(custom?.detail?.message || "").trim();
      if (!message) return;
      toast.error(message);
    }

    window.addEventListener(DAA_DASHBOARD_PERSIST_ERROR_EVENT_V1, onPersistError as EventListener);
    return () => {
      window.removeEventListener(DAA_DASHBOARD_PERSIST_ERROR_EVENT_V1, onPersistError as EventListener);
    };
  }, []);

  return null;
}
