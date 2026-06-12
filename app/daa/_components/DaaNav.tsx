"use client";

import type { ComponentType } from "react";

import { Briefcase, CalendarCheck, ClipboardList, FlaskConical, Menu, RefreshCw, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DAA_BRAND_ICON_PATH, DAA_BRAND_NAME } from "@/src/daa/brand";
import {
  WORKBENCH_SECTIONS,
  resolveWorkbenchSection,
  type WorkbenchSectionKey,
  type WorkbenchSectionMeta,
} from "./workbenchSections";

type IconType = ComponentType<{ className?: string }>;
type NavItem = WorkbenchSectionMeta & { Icon: IconType };

const WORKBENCH_SECTION_ICONS: Record<WorkbenchSectionKey, IconType> = {
  today: CalendarCheck,
  portfolio: Briefcase,
  rebalance: RefreshCw,
  trades: ClipboardList,
  "strategy-lab": FlaskConical,
  settings: Settings,
};

const WORKBENCH_NAV_ITEMS: NavItem[] = WORKBENCH_SECTIONS.map((section) => ({
  ...section,
  Icon: WORKBENCH_SECTION_ICONS[section.key],
}));

function useActiveWorkbenchSection(): WorkbenchSectionKey {
  return resolveWorkbenchSection(usePathname() || "").key;
}

type SidebarNavProps = {
  collapsed?: boolean;
  onNavigate?: () => void;
};

export function DaaBrandMark(props: { className?: string }) {
  return (
    <img
      src={DAA_BRAND_ICON_PATH}
      alt=""
      aria-hidden="true"
      className={cn("rounded-[var(--radius-md)] object-cover", props.className)}
    />
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
      className={cn(
        "group relative flex items-center rounded-[var(--radius-md)] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        collapsed ? "h-10 w-10 justify-center" : "h-10 w-full gap-3 px-3",
        isActive
          ? "bg-[var(--hover)] text-[var(--text)]"
          : "text-[var(--muted)] hover:bg-[var(--elevated)] hover:text-[var(--text)]",
      )}
    >
      {/* 左侧活跃指示条 */}
      {isActive && !collapsed ? (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--primary)]" />
      ) : null}

      <item.Icon
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
          isActive ? "text-[var(--primary)]" : "text-[var(--muted)] group-hover:text-[var(--text)]",
        )}
        aria-hidden="true"
      />
      {!collapsed ? (
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.label}</span>
      ) : null}
    </Link>
  );

  if (!collapsed) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="right" className="border-[var(--border)] bg-[var(--surface)] text-[13px] text-[var(--text)]">
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}

export function DaaSidebarNav({ collapsed = false, onNavigate }: SidebarNavProps) {
  const activeSectionKey = useActiveWorkbenchSection();

  return (
    <TooltipProvider delayDuration={120}>
      <nav className={cn("flex flex-col gap-1", collapsed ? "items-center" : "items-stretch")} aria-label="DAA 主导航">
        {WORKBENCH_NAV_ITEMS.map((item) => (
          <SidebarLink
            key={item.key}
            item={item}
            collapsed={collapsed}
            isActive={activeSectionKey === item.key}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    </TooltipProvider>
  );
}

export function DaaMobileNav() {
  const [open, setOpen] = useState(false);
  const activeSectionKey = useActiveWorkbenchSection();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="打开导航菜单"
          className="h-8 w-8 shrink-0 text-[var(--muted)] hover:bg-[var(--elevated)] hover:text-[var(--text)]"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[260px] border-r-0 border-transparent bg-[var(--surface)] px-0"
      >
        <SheetHeader className="px-4 pb-4 pt-5">
          <SheetTitle className="flex items-center gap-2.5 text-left text-[15px] font-semibold text-[var(--text)]">
            <DaaBrandMark className="h-7 w-7" />
            {DAA_BRAND_NAME}
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-3" aria-label="DAA 主导航">
          {WORKBENCH_NAV_ITEMS.map((item) => {
            const isActive = activeSectionKey === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "group relative flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-[13px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  isActive
                    ? "bg-[var(--hover)] text-[var(--text)]"
                    : "text-[var(--muted)] hover:bg-[var(--elevated)] hover:text-[var(--text)]",
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
