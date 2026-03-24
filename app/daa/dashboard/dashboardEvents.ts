"use client";

export const DAA_DASHBOARD_DATA_UPDATED_EVENT = "daa:dashboard:data-updated";
export const DAA_DASHBOARD_REFRESH_EVENT = "daa:dashboard:refresh";

export function emitDashboardDataUpdated(detail?: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent(DAA_DASHBOARD_DATA_UPDATED_EVENT, {
    detail: {
      ts: Date.now(),
      ...(detail || {}),
    },
  }));
}

export function emitDashboardRefresh(detail?: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent(DAA_DASHBOARD_REFRESH_EVENT, {
    detail: {
      ts: Date.now(),
      ...(detail || {}),
    },
  }));
}
