"use client";

export const DAA_WORKBENCH_DATA_UPDATED_EVENT = "daa:dashboard:data-updated";
export const DAA_WORKBENCH_REFRESH_EVENT = "daa:dashboard:refresh";

export function emitWorkbenchDataUpdated(detail?: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent(DAA_WORKBENCH_DATA_UPDATED_EVENT, {
    detail: {
      ts: Date.now(),
      ...(detail || {}),
    },
  }));
}

export function emitWorkbenchRefresh(detail?: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent(DAA_WORKBENCH_REFRESH_EVENT, {
    detail: {
      ts: Date.now(),
      ...(detail || {}),
    },
  }));
}
