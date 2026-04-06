"use client";

import type { ComponentType } from "react";

import { Briefcase, ClipboardList, FlaskConical, Menu, RefreshCw, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DAA_BRAND_NAME } from "@/src/daa/brand";

type NavKey = "portfolio" | "rebalance" | "trades" | "strategy-lab" | "settings";
type IconType = ComponentType<{ className?: string }>;
type NavItem = { key: NavKey; href: string; label: string; shortLabel: string; Icon: IconType };

function useActiveNav(): NavKey | null {
  const pathname = usePathname() || "";
  if (pathname.startsWith("/daa/dashboard/portfolio") || pathname.startsWith("/daa/dashboard/today")) return "portfolio";
  if (pathname.startsWith("/daa/dashboard/rebalance")) return "rebalance";
  if (pathname.startsWith("/daa/dashboard/trades")) return "trades";
  if (pathname.startsWith("/daa/dashboard/strategy-lab")) return "strategy-lab";
  if (pathname.startsWith("/daa/dashboard/settings")) return "settings";
  return "portfolio";
}

function useNavItems(): NavItem[] {
  return useMemo(
    () => [
      { key: "portfolio" as const, href: "/daa/dashboard/portfolio", label: "持仓", shortLabel: "持仓", Icon: Briefcase },
      { key: "rebalance" as const, href: "/daa/dashboard/rebalance", label: "调仓", shortLabel: "调仓", Icon: RefreshCw },
      { key: "trades" as const, href: "/daa/dashboard/trades", label: "交易记录", shortLabel: "交易", Icon: ClipboardList },
      { key: "strategy-lab" as const, href: "/daa/dashboard/strategy-lab", label: "策略实验室", shortLabel: "回测", Icon: FlaskConical },
      { key: "settings" as const, href: "/daa/dashboard/settings", label: "设置", shortLabel: "设置", Icon: Settings },
    ],
    [],
  );
}

type SidebarNavProps = {
  collapsed?: boolean;
  onNavigate?: () => void;
};

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
      className={cn(
        "group relative flex items-center rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        collapsed ? "mx-auto h-10 w-10 justify-center" : "w-full gap-3 px-3 py-2.5",
        isActive
          ? "bg-[rgba(255,255,255,0.08)] text-[var(--text)]"
          : "text-[var(--muted)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text)]",
      )}
    >
      {/* 左侧活跃指示条 */}
      {isActive && !collapsed ? (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--primary)]" />
      ) : null}

      <item.Icon
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
          isActive ? "text-[var(--primary)]" : "text-[var(--faint)] group-hover:text-[var(--muted)]",
        )}
        aria-hidden="true"
      />
      {!collapsed ? (
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-[-0.01em]">{item.label}</span>
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
      <nav className="flex flex-col gap-1" aria-label="DAA 主导航">
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
        className="w-[260px] border-r-0 px-0"
        style={{ background: "rgba(10,14,22,0.98)", borderColor: "transparent" }}
      >
        <SheetHeader className="px-4 pb-4 pt-5">
          <SheetTitle className="flex items-center gap-2.5 text-left text-[15px] font-semibold tracking-[-0.02em] text-[var(--text)]">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#38BDF8,#818CF8)] text-[11px] font-bold text-white" style={{ fontFamily: "var(--font-mono)" }}>D</span>
            {DAA_BRAND_NAME}
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-3" aria-label="DAA 主导航">
          {items.map((item) => {
            const isActive = active === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  isActive
                    ? "bg-[rgba(255,255,255,0.08)] text-[var(--text)]"
                    : "text-[var(--muted)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text)]",
                )}
              >
                {isActive ? <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--primary)]" /> : null}
                <item.Icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-[var(--primary)]" : "text-[var(--faint)]")} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
