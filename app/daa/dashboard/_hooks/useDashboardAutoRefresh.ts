"use client";

import { useEffect } from "react";

import { DAA_DASHBOARD_REFRESH_EVENT } from "@/app/daa/dashboard/dashboardEvents";

export function useDashboardAutoRefresh(load: (silent: boolean) => Promise<void>) {
  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    function onRefresh() {
      void load(true);
    }
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT, onRefresh);
  }, [load]);
}
