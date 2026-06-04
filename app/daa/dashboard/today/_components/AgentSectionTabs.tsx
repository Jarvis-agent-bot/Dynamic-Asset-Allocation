"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, Database, ListChecks } from "lucide-react";

import { cn } from "@/lib/utils";

const AGENT_TABS = [
  { key: "briefing", href: "/daa/dashboard/today", label: "今日待办", Icon: ListChecks },
  { key: "decisions", href: "/daa/dashboard/today/decisions", label: "决策记录", Icon: Database },
  { key: "memories", href: "/daa/dashboard/today/memories", label: "记忆", Icon: Brain },
] as const;

function resolveActiveTab(pathname: string) {
  if (pathname.startsWith("/daa/dashboard/today/decisions")) return "decisions";
  if (pathname.startsWith("/daa/dashboard/today/memories")) return "memories";
  return "briefing";
}

export function AgentSectionTabs() {
  const pathname = usePathname() || "";
  const active = resolveActiveTab(pathname);

  return (
    <nav
      aria-label="Agent 页面"
      className="mb-4 flex w-full min-w-0 gap-1 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-1"
    >
      {AGENT_TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-[var(--radius-md)] px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-[var(--elevated)] text-[var(--text)] shadow-[inset_0_1px_0_var(--surface)]"
                : "text-[var(--muted)] hover:bg-[var(--elevated)] hover:text-[var(--text)]",
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
