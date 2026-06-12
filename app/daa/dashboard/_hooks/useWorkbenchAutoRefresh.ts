"use client";

import { useEffect } from "react";

import { DAA_WORKBENCH_REFRESH_EVENT } from "@/app/daa/dashboard/workbenchEvents";

export function useWorkbenchAutoRefresh(load: (silent: boolean) => Promise<void>) {
  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    function onRefresh() {
      void load(true);
    }
    window.addEventListener(DAA_WORKBENCH_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(DAA_WORKBENCH_REFRESH_EVENT, onRefresh);
  }, [load]);
}
