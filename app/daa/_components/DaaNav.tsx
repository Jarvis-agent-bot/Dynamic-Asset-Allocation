"use client";

import type { ComponentType } from "react";

import { Briefcase, FlaskConical, Menu, Settings, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type NavKey =
  | "assets"
  | "portfolio"
  | "strategyLab"
  | "humanFactor"
  | "settings";

type IconType = ComponentType<{ className?: string }>;

type NavItem = { key: NavKey; href: string; label: string; Icon: IconType };

function useActiveNav(): NavKey | null {
  const pathname = usePathname() || "";
  if (pathname.startsWith("/daa/dashboard/portfolio")) return "portfolio";
  if (pathname.startsWith("/daa/dashboard/strategy-lab")) return "strategyLab";
  if (pathname.startsWith("/daa/dashboard/human-factor")) return "humanFactor";
  if (pathname.startsWith("/daa/dashboard/settings")) return "settings";
  return "assets";
}

function useNavItems(): NavItem[] {
  return useMemo(
    () => [
      { key: "assets" as const, href: "/daa/dashboard", label: "资产首页", Icon: Wallet },
      { key: "portfolio" as const, href: "/daa/dashboard/portfolio", label: "工作台", Icon: Briefcase },
      { key: "strategyLab" as const, href: "/daa/dashboard/strategy-lab", label: "策略实验室", Icon: FlaskConical },
      { key: "humanFactor" as const, href: "/daa/dashboard/human-factor", label: "人因中心", Icon: Users },
      { key: "settings" as const, href: "/daa/dashboard/settings", label: "系统设置", Icon: Settings },
    ],
    [],
  );
}

type NavListProps = {
  variant: "horizontal" | "vertical";
  onNavigate?: () => void;
};

function DaaNavList({ variant, onNavigate }: NavListProps) {
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
        <Button variant="ghost" size="icon" aria-label="打开导航菜单" className="shrink-0">
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
