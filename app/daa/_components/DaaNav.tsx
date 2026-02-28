"use client";

import type { ComponentType } from "react";

import { Cpu, Menu, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Tab = "unified-core" | "settings";

type IconType = ComponentType<{ className?: string }>;

type NavItem = { key: Tab; href: string; label: string; Icon: IconType };

function normalizeTab(raw: string | null): Tab {
  if (raw === "unified-core") return "unified-core";
  if (raw === "settings") return "settings";
  return "unified-core";
}

function useActiveTab(): Tab | null {
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();

  const tab = normalizeTab(searchParams.get("tab"));
  const isOnDashboard = pathname === "/daa/dashboard" || pathname === "/daa/dashboard/";

  return isOnDashboard ? tab : null;
}

function useNavItems(): NavItem[] {
  return useMemo(
    () => [
      { key: "unified-core", href: "/daa/dashboard?tab=unified-core", label: "Unified Core", Icon: Cpu },
      { key: "settings", href: "/daa/dashboard?tab=settings", label: "Settings", Icon: Settings },
    ],
    []
  );
}

type NavListProps = {
  variant: "horizontal" | "vertical";
  onNavigate?: () => void;
};

function DaaNavList({ variant, onNavigate }: NavListProps) {
  const items = useNavItems();
  const active = useActiveTab();

  if (variant === "horizontal") {
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
                isActive && "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground",
                "focus-visible:ring-offset-1"
              )}
            >
              <Link href={it.href} aria-current={isActive ? "page" : undefined} onClick={onNavigate}>
                <it.Icon className="h-4 w-4" aria-hidden="true" />
                <span>{it.label}</span>
              </Link>
            </Button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-1" aria-label="DAA">
      {items.map((it) => {
        const isActive = active === it.key;
        return (
          <Button
            key={it.key}
            asChild
            variant={isActive ? "secondary" : "ghost"}
            className={cn("w-full justify-start", isActive && "font-medium")}
          >
            <Link href={it.href} aria-current={isActive ? "page" : undefined} onClick={onNavigate}>
              <it.Icon className="h-4 w-4" aria-hidden="true" />
              <span>{it.label}</span>
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}

export function DaaSidebarNav() {
  return <DaaNavList variant="vertical" />;
}

export function DaaMobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open navigation" className="shrink-0">
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 px-4">
        <SheetHeader className="pr-8">
          <SheetTitle>DAA</SheetTitle>
        </SheetHeader>
        <div className="mt-6">
          <DaaNavList variant="vertical" onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function DaaInlineNav() {
  return <DaaNavList variant="horizontal" />;
}
