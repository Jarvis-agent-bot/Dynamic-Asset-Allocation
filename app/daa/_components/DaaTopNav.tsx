"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tab = "dashboard" | "wizard" | "market-funds";

function normalizeTab(raw: string | null): Tab {
  if (raw === "wizard") return "wizard";
  if (raw === "market-funds") return "market-funds";
  return "dashboard";
}

export default function DaaTopNav() {
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();

  // All dashboard tabs share the same pathname; the tab lives in query string.
  const tab = normalizeTab(searchParams.get("tab"));
  const isOnDashboard = pathname === "/daa/dashboard" || pathname === "/daa/dashboard/";

  const active: Tab | null = isOnDashboard ? tab : null;

  const items: Array<{ key: Tab; href: string; label: string }> = [
    { key: "dashboard", href: "/daa/dashboard", label: "Dashboard" },
    { key: "wizard", href: "/daa/dashboard?tab=wizard&step=1", label: "Wizard" },
    { key: "market-funds", href: "/daa/dashboard?tab=market-funds", label: "Market/Funds" },
  ];

  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="DAA">
      {items.map((it) => {
        const isActive = active === it.key;
        return (
          <Button
            key={it.key}
            asChild
            variant="ghost"
            size="sm"
            className={cn(
              // Active state: shadcn-style pill highlight.
              isActive && "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground",
              // Slightly smaller offset looks better in tight header layouts.
              "focus-visible:ring-offset-1"
            )}
          >
            <Link href={it.href} aria-current={isActive ? "page" : undefined}>
              {it.label}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}
