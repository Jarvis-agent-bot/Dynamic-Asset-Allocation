import type { Metadata } from "next";
import type React from "react";

import { DAA_BRAND_NAME } from "@/src/daa/brand";
import DaaSessionGuard from "./_components/DaaSessionGuard";

export const metadata: Metadata = {
  title: DAA_BRAND_NAME,
};

type Props = {
  children: React.ReactNode;
};

export default function DaaLayout({ children }: Props) {
  return (
    <div className="min-h-svh bg-background">
      <DaaSessionGuard />
      {children}
    </div>
  );
}
