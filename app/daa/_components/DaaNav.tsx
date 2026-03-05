"use client";

import type { ComponentType } from "react";

import { Briefcase, ClipboardList, Menu, PieChart, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type NavKey =
  | "overview"
  | "workbench"
  | "trades"
  | "settings";

type IconType = ComponentType<{ className?: string }>;

type NavItem = { key: NavKey; href: string; label: string; Icon: IconType };

function useActiveNav(): NavKey | null {
  const pathname = usePathname() || "";
  if (pathname.startsWith("/daa/dashboard/workbench")) return "workbench";
  if (pathname.startsWith("/daa/dashboard/trades")) return "trades";
  if (pathname.startsWith("/daa/dashboard/settings")) return "settings";
  // Also match legacy /portfolio route to workbench during transition
  if (pathname.startsWith("/daa/dashboard/portfolio")) return "workbench";
  return "overview";
}

function useNavItems(): NavItem[] {
  return useMemo(
    () => [
      { key: "overview" as const, href: "/daa/dashboard", label: "总览", Icon: PieChart },
      { key: "workbench" as const, href: "/daa/dashboard/workbench", label: "工作台", Icon: Briefcase },
      { key: "trades" as const, href: "/daa/dashboard/trades", label: "交易记录", Icon: ClipboardList },
      { key: "settings" as const, href: "/daa/dashboard/settings", label: "设置", Icon: Settings },
    ],
    [],
  );
}

type NavListProps = {
  variant: "horizontal" | "vertical";
  collapsed?: boolean;
  onNavigate?: () => void;
};

function DaaNavList({ variant, collapsed = false, onNavigate }: NavListProps) {
  const items = useNavItems();
  const active = useActiveNav();

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
                "focus-visible:ring-offset-1",
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
            className={cn(
              "w-full h-9",
              collapsed ? "justify-center px-1.5" : "justify-start px-2",
              isActive && "font-medium",
            )}
          >
            <Link
              href={it.href}
              aria-current={isActive ? "page" : undefined}
              onClick={onNavigate}
              title={collapsed ? it.label : undefined}
            >
              <it.Icon className="h-4 w-4" aria-hidden="true" />
              <span className={collapsed ? "sr-only" : ""}>{it.label}</span>
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}

export function DaaSidebarNav(props: { collapsed?: boolean }) {
  return <DaaNavList variant="vertical" collapsed={props.collapsed} />;
}

export function DaaMobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="打开导航菜单" className="shrink-0">
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 px-3">
        <SheetHeader className="pr-8">
          <SheetTitle>DAA</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <DaaNavList variant="vertical" onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function DaaInlineNav() {
  return <DaaNavList variant="horizontal" />;
}
