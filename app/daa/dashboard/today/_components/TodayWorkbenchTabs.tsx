"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, Database, ListChecks } from "lucide-react";

import { cn } from "@/lib/utils";

const TODAY_WORKBENCH_TABS = [
  { key: "briefing", href: "/daa/dashboard/today", label: "今日结论", Icon: ListChecks },
  { key: "decisions", href: "/daa/dashboard/today/decisions", label: "调仓记录", Icon: Database },
  { key: "experienceLibrary", href: "/daa/dashboard/today/experience-library", label: "经验库", Icon: Archive },
] as const;

function resolveActiveTab(pathname: string) {
  if (pathname.startsWith("/daa/dashboard/today/decisions")) return "decisions";
  if (
    pathname.startsWith("/daa/dashboard/today/experience-library")
    || pathname.startsWith("/daa/dashboard/today/memories")
  ) return "experienceLibrary";
  return "briefing";
}

export function TodayWorkbenchTabs() {
  const pathname = usePathname() || "";
  const active = resolveActiveTab(pathname);

  return (
    <nav
      aria-label="今日工作台"
      className="mb-4 flex w-full min-w-0 items-center gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--bg)]"
    >
      {TODAY_WORKBENCH_TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "border-[var(--primary)] text-[var(--text)]"
                : "border-transparent text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
            )}
          >
            <tab.Icon className={cn("h-3.5 w-3.5", isActive ? "text-[var(--primary)]" : "text-[var(--faint)]")} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
