"use client";

import type { ComponentType } from "react";

import { Briefcase, ClipboardList, Menu, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DAA_BRAND_NAME } from "@/src/daa/brand";

type NavKey = "workbench" | "trades" | "settings";
type IconType = ComponentType<{ className?: string }>;
type NavItem = { key: NavKey; href: string; label: string; shortLabel: string; Icon: IconType };

function useActiveNav(): NavKey | null {
  const pathname = usePathname() || "";
  if (pathname.startsWith("/daa/dashboard/workbench")) return "workbench";
  if (pathname.startsWith("/daa/dashboard/trades")) return "trades";
  if (pathname.startsWith("/daa/dashboard/settings")) return "settings";
  return "workbench";
}

function useNavItems(): NavItem[] {
  return useMemo(
    () => [
      { key: "workbench" as const, href: "/daa/dashboard/workbench", label: "工作台", shortLabel: "工作台", Icon: Briefcase },
      { key: "trades" as const, href: "/daa/dashboard/trades", label: "交易记录", shortLabel: "交易", Icon: ClipboardList },
      { key: "settings" as const, href: "/daa/dashboard/settings", label: "设置", shortLabel: "设置", Icon: Settings },
    ],
    [],
  );
}

type SidebarNavProps = {
  collapsed?: boolean;
  onNavigate?: () => void;
};

function sidebarLinkClassName(input: { collapsed: boolean; isActive: boolean }) {
  const base = input.collapsed
    ? "mx-auto flex h-10 w-10 items-center justify-center rounded-lg"
    : "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2";

  const tone = input.isActive
    ? "bg-[rgba(56,189,248,0.12)] text-[var(--text)]"
    : "text-[var(--muted)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text)]";

  return cn(
    "group relative transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    base,
    tone,
  );
}

function sidebarIconClassName(input: { isActive: boolean }) {
  return cn(
    "h-[18px] w-[18px] shrink-0 transition-colors duration-150",
    input.isActive ? "text-[var(--primary)]" : "text-[var(--muted)] group-hover:text-[var(--text)]",
  );
}

function SidebarLink(props: {
  item: NavItem;
  collapsed: boolean;
  isActive: boolean;
  onNavigate?: () => void;
}) {
  const { item, collapsed, isActive, onNavigate } = props;
  const content = (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={sidebarLinkClassName({ collapsed, isActive })}
    >
      <item.Icon className={sidebarIconClassName({ isActive })} aria-hidden="true" />
      {!collapsed ? (
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.label}</span>
      ) : null}
    </Link>
  );

  if (!collapsed) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="right" className="border-[var(--border)] bg-[rgba(8,12,20,0.98)] text-[13px] text-[var(--text)]">
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}

export function DaaSidebarNav({ collapsed = false, onNavigate }: SidebarNavProps) {
  const items = useNavItems();
  const active = useActiveNav();

  return (
    <TooltipProvider delayDuration={120}>
      <nav className="flex flex-col gap-0.5" aria-label="DAA 主导航">
        {items.map((item) => (
          <SidebarLink
            key={item.key}
            item={item}
            collapsed={collapsed}
            isActive={active === item.key}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    </TooltipProvider>
  );
}

export function DaaMobileNav() {
  const [open, setOpen] = useState(false);
  const items = useNavItems();
  const active = useActiveNav();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="打开导航菜单"
          className="h-8 w-8 shrink-0 text-[var(--muted)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text)]"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-72 border-r px-0"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <SheetHeader className="border-b border-[var(--border)] px-4 pb-3 pt-4">
          <SheetTitle className="text-left text-[15px] font-semibold tracking-[-0.02em] text-[var(--text)]">
            {DAA_BRAND_NAME}
          </SheetTitle>
        </SheetHeader>
        <nav className="mt-2 flex flex-col gap-0.5 px-2" aria-label="DAA 主导航">
          {items.map((item) => {
            const isActive = active === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-[rgba(56,189,248,0.12)] text-[var(--text)]"
                    : "text-[var(--muted)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text)]",
                )}
              >
                <item.Icon className={sidebarIconClassName({ isActive })} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
