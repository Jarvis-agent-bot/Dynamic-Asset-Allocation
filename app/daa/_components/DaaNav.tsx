"use client";

import type { ComponentType } from "react";

import { Briefcase, ClipboardList, FlaskConical, Menu, PieChart, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type NavKey = "overview" | "workbench" | "strategy-lab" | "trades" | "settings";
type IconType = ComponentType<{ className?: string }>;
type NavItem = { key: NavKey; href: string; label: string; shortLabel: string; Icon: IconType };

function useActiveNav(): NavKey | null {
  const pathname = usePathname() || "";
  if (pathname.startsWith("/daa/dashboard/workbench")) return "workbench";
  if (pathname.startsWith("/daa/dashboard/strategy-lab")) return "strategy-lab";
  if (pathname.startsWith("/daa/dashboard/trades")) return "trades";
  if (pathname.startsWith("/daa/dashboard/settings")) return "settings";
  if (pathname.startsWith("/daa/dashboard/portfolio")) return "workbench";
  return "overview";
}

function useNavItems(): NavItem[] {
  return useMemo(
    () => [
      { key: "overview" as const, href: "/daa/dashboard", label: "总览", shortLabel: "总览", Icon: PieChart },
      { key: "workbench" as const, href: "/daa/dashboard/workbench", label: "工作台", shortLabel: "工作台", Icon: Briefcase },
      { key: "strategy-lab" as const, href: "/daa/dashboard/strategy-lab", label: "策略实验室", shortLabel: "策略", Icon: FlaskConical },
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
    ? "mx-auto flex h-[74px] w-full max-w-[72px] flex-col items-center justify-center gap-1.5 rounded-[20px] border px-0 py-2"
    : "flex w-full items-center gap-3 rounded-[16px] border px-3 py-2.5";

  const tone = input.isActive
    ? "border-[rgba(56,189,248,0.24)] bg-[linear-gradient(135deg,rgba(56,189,248,0.16),rgba(129,140,248,0.08))] text-[var(--text)] shadow-[0_14px_28px_rgba(0,0,0,0.18)]"
    : "border-transparent bg-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[rgba(255,255,255,0.03)] hover:text-[var(--text)]";

  return cn(
    "group relative overflow-hidden transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    base,
    tone,
  );
}

function sidebarIconShellClassName(input: { collapsed: boolean; isActive: boolean }) {
  return cn(
    "relative flex items-center justify-center rounded-[12px] border transition-all duration-200",
    input.collapsed ? "h-10 w-10" : "h-9 w-9 shrink-0",
    input.isActive
      ? "border-[rgba(56,189,248,0.24)] bg-[rgba(56,189,248,0.14)] text-[var(--primary)] shadow-[0_8px_20px_rgba(56,189,248,0.16)]"
      : "border-[var(--border)] bg-[rgba(255,255,255,0.02)] text-[var(--muted)] group-hover:border-[var(--border-strong)] group-hover:text-[var(--text)]",
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
      {!collapsed && isActive ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-[var(--primary)]" /> : null}
      <span className={sidebarIconShellClassName({ collapsed, isActive })}>
        <item.Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      {collapsed ? (
        <span
          className={cn(
            "text-[10px] font-semibold leading-none tracking-[0.08em] transition-colors duration-200",
            isActive ? "text-[var(--text)]" : "text-[var(--faint)] group-hover:text-[var(--text)]",
          )}
        >
          {item.shortLabel}
        </span>
      ) : <span className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-[-0.01em]">{item.label}</span>}
      {!collapsed ? (
        <span
          className={cn(
            "ml-auto h-1.5 w-1.5 rounded-full transition-all duration-200",
            isActive ? "bg-[var(--primary)] opacity-100" : "bg-[var(--border-strong)] opacity-0 group-hover:opacity-100",
          )}
        />
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
      <nav className={cn("flex flex-col", collapsed ? "gap-1.5" : "gap-1.5")} aria-label="DAA 主导航">
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
        <SheetHeader className="border-b border-[var(--border)] px-4 pb-4 pt-5">
          <SheetTitle className="text-left font-[var(--font-display)] text-[24px] tracking-[-0.03em] text-[var(--text)]">
            DeepLedger
          </SheetTitle>
          <div className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">
            Bloomberg x SaaS Console
          </div>
        </SheetHeader>
        <nav className="mt-3 flex flex-col gap-1.5 px-3" aria-label="DAA 主导航">
          {items.map((item) => {
            const isActive = active === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "group relative flex items-center gap-3 rounded-[16px] border px-3 py-3 text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "border-[rgba(56,189,248,0.24)] bg-[linear-gradient(135deg,rgba(56,189,248,0.16),rgba(129,140,248,0.08))] text-[var(--text)]"
                    : "border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[rgba(255,255,255,0.03)] hover:text-[var(--text)]",
                )}
              >
                {isActive ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-[var(--primary)]" /> : null}
                <span className={sidebarIconShellClassName({ collapsed: false, isActive })}>
                  <item.Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium tracking-[-0.01em]">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function DaaInlineNav() {
  const items = useNavItems();
  const active = useActiveNav();
  return (
    <nav className="flex flex-wrap items-center gap-1.5" aria-label="DAA">
      {items.map((item) => {
        const isActive = active === item.key;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all duration-200",
              isActive
                ? "border-[rgba(56,189,248,0.24)] bg-[rgba(56,189,248,0.12)] text-[var(--text)]"
                : "border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[rgba(255,255,255,0.03)] hover:text-[var(--text)]",
            )}
          >
            <item.Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
