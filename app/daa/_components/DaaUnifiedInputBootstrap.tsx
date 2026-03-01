"use client";

import { useEffect } from "react";

import { bootstrapUnifiedInputRuntimeV1 } from "../unifiedInputStore";

export function DaaUnifiedInputBootstrap() {
  useEffect(() => {
    bootstrapUnifiedInputRuntimeV1({ dispatchEvent: true });
  }, []);

  return null;
}
