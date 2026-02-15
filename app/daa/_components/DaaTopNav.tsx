"use client";

import type { ComponentType } from "react";

import { BarChart3, LayoutDashboard, Settings, Wand2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tab = "dashboard" | "wizard" | "market-funds" | "settings";

type IconType = ComponentType<{ className?: string }>;

type NavItem = { key: Tab; href: string; label: string; Icon: IconType };

function normalizeTab(raw: string | null): Tab {
  if (raw === "wizard") return "wizard";
  if (raw === "market-funds") return "market-funds";
  if (raw === "settings") return "settings";
  return "dashboard";
}

export default function DaaTopNav() {
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();

  const isSettingsRoute = pathname === "/daa/dashboard/settings" || pathname === "/daa/dashboard/settings/";

  // All dashboard tabs share the same pathname; the tab lives in query string.
  const tab = normalizeTab(searchParams.get("tab"));
  const isOnDashboard = pathname === "/daa/dashboard" || pathname === "/daa/dashboard/";

  const active: Tab | null = isSettingsRoute ? "settings" : isOnDashboard ? tab : null;

  const items: NavItem[] = [
    { key: "dashboard", href: "/daa/dashboard", label: "Dashboard", Icon: LayoutDashboard },
    { key: "wizard", href: "/daa/dashboard?tab=wizard&step=1", label: "Wizard", Icon: Wand2 },
    { key: "market-funds", href: "/daa/dashboard?tab=market-funds", label: "Market/Funds", Icon: BarChart3 },
    { key: "settings", href: "/daa/dashboard/settings", label: "Settings", Icon: Settings },
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
              <it.Icon className="h-4 w-4" aria-hidden="true" />
              <span>{it.label}</span>
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}
