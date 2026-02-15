import type React from "react";

import DashboardShell from "./_components/DashboardShell";

type Props = {
  children: React.ReactNode;
};

export default function DaaDashboardLayout({ children }: Props) {
  return <DashboardShell>{children}</DashboardShell>;
}
