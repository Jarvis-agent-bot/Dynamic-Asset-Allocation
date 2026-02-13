"use client";

import {
  appendDynamicRebalanceNotificationLogV0,
  type DynamicRebalanceNotificationKindV0,
} from "@/src/daa/dynamicRebalanceNotificationLogStoreV0";
import { loadDynamicRebalanceNotifyPrefsStateV1 } from "@/src/daa/dynamicRebalanceNotificationPrefsStoreV0";

function canUseBrowserNotifications(): boolean {
  return typeof window !== "undefined" && typeof (window as any).Notification !== "undefined";
}

function isGranted(): boolean {
  if (!canUseBrowserNotifications()) return false;
  return (window as any).Notification.permission === "granted";
}

export function requestBrowserNotificationPermissionV0(): Promise<NotificationPermission> {
  if (!canUseBrowserNotifications()) return Promise.resolve("denied");

  try {
    const N: any = (window as any).Notification;
    if (typeof N.requestPermission === "function") return N.requestPermission();
  } catch {
    // ignore
  }

  return Promise.resolve((window as any).Notification.permission ?? "default");
}

export function pushDynamicRebalanceNotificationV0(args: {
  storage: Pick<Storage, "getItem" | "setItem">;
  atIso: string;
  kind: DynamicRebalanceNotificationKindV0;
  title: string;
  body: string;
}): { ok: true; browserSent: boolean } | { ok: false; skipped: string } {
  const prefsState = loadDynamicRebalanceNotifyPrefsStateV1(args.storage);
  const prefs = prefsState.prefs;

  if (!prefs.enabled) return { ok: false, skipped: "prefs.disabled" };

  const kind = args.kind;
  const enabledForKind =
    kind === "schedule-due"
      ? prefs.events.scheduleDue
      : kind === "skip-market-closed"
        ? prefs.events.skipMarketClosed
        : kind === "skip-data-stale"
          ? prefs.events.skipDataStale
          : kind === "run-recorded"
            ? prefs.events.runRecorded
            : true;

  if (!enabledForKind) return { ok: false, skipped: "prefs.event-disabled" };

  // Always record into the local log for visibility/debugging.
  appendDynamicRebalanceNotificationLogV0({
    storage: args.storage,
    at: args.atIso,
    kind,
    title: args.title,
    body: args.body,
  });

  const shouldBrowser = prefs.channel.browser && isGranted();
  if (shouldBrowser) {
    try {
      const N: any = (window as any).Notification;
      // `tag` dedupes notifications in some browsers.
      new N(args.title, { body: args.body, tag: `daa:${kind}:${args.atIso}` });
    } catch {
      // ignore
    }
  }

  return { ok: true, browserSent: shouldBrowser };
}
