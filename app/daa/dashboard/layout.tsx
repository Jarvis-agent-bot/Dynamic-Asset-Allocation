import type React from "react";

import WorkbenchShell from "./_components/WorkbenchShell";

type Props = {
  children: React.ReactNode;
};

export default function DaaWorkbenchLayout({ children }: Props) {
  return <WorkbenchShell>{children}</WorkbenchShell>;
}
