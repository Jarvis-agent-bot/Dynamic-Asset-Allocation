import type { Metadata } from "next";
import type React from "react";

import DaaShell from "./_components/DaaShell";

export const metadata: Metadata = {
  title: "DAA Console",
};

type Props = {
  children: React.ReactNode;
};

export default function DaaLayout({ children }: Props) {
  return <DaaShell>{children}</DaaShell>;
}
