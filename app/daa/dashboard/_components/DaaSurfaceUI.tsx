import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ComponentPropsWithoutRef, ReactNode } from "react";

import { DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type DaaSurfaceTone = "primary" | "warning" | "success" | "danger" | "info" | "neutral";

const TONE_SURFACE_CLASS: Record<DaaSurfaceTone, string> = {
  primary: "border-[var(--primary-border)] bg-[var(--primary-bg)] text-[var(--primary)]",
  warning: "border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber)]",
  success: "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]",
  danger: "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]",
  info: "border-[var(--indigo-border)] bg-[var(--indigo-bg)] text-[var(--indigo)]",
  neutral: "border-[var(--muted-border)] bg-[var(--muted-bg)] text-[var(--muted)]",
};

const TONE_TEXT_CLASS: Record<DaaSurfaceTone, string> = {
  primary: "text-[var(--primary)]",
  warning: "text-[var(--amber)]",
  success: "text-[var(--success)]",
  danger: "text-[var(--danger)]",
  info: "text-[var(--indigo)]",
  neutral: "text-[var(--muted)]",
};

export const daaSurfaceFieldClassName =
  "w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--faint)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-bg)]";

export const daaSurfaceDenseFieldClassName =
  "h-8 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 text-xs text-[var(--text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--faint)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-bg)]";

export const daaSurfaceSubtlePanelClassName =
  "rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]";

export const daaSurfaceMonoPanelClassName =
  "rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 font-[var(--font-mono)] text-xs leading-6 text-[var(--muted)]";

export const daaSurfaceTableHeadClassName =
  "border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]";

export const daaSurfaceTableCellClassName =
  "border-b border-[var(--border)]/70 px-3 py-2.5 align-top text-sm";

const daaSurfaceDialogContentClassName =
  "flex max-h-[min(90dvh,860px)] w-[calc(100vw-1rem)] max-w-[720px] flex-col overflow-hidden border-[var(--border)] bg-[var(--card)] p-0 text-[var(--text)] sm:w-[calc(100vw-2rem)]";

export function DaaSurfacePageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between", className)}>
      <div className="space-y-2">
        {eyebrow ? (
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-normal text-[var(--muted)]">
            <span className="h-px w-8 bg-[var(--primary)]/60" />
            <span>{eyebrow}</span>
          </div>
        ) : null}
        <div>
          <h1 className="text-[26px] font-semibold leading-none text-[var(--text)] sm:text-[30px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </div>
  );
}

export function DaaSurfaceMetricCard({
  label,
  value,
  subLabel,
  accent = "primary",
  children,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  subLabel?: ReactNode;
  accent?: DaaSurfaceTone;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3.5 transition-colors duration-150 hover:border-[var(--border-strong)]",
        className,
      )}
    >
      <div className="relative">
        <div className={cn("text-[11px] font-semibold uppercase tracking-normal", TONE_TEXT_CLASS[accent])}>{label}</div>
        <div className="mt-2 font-[var(--font-mono)] text-[23px] leading-none text-[var(--text)] sm:text-[24px]">
          {value}
        </div>
        {subLabel ? <div className="mt-1.5 text-xs text-[var(--muted)]">{subLabel}</div> : null}
        {children ? <div className="mt-3">{children}</div> : null}
      </div>
    </div>
  );
}

export function DaaSurfacePanel({
  title,
  subtitle,
  accent = "primary",
  action,
  className,
  bodyClassName,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  accent?: DaaSurfaceTone;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]",
        className,
      )}
      data-accent={accent}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5 sm:px-4">
        <div>
          <div className="flex items-center">
            <h2 className="text-[15px] font-semibold text-[var(--text)]">{title}</h2>
          </div>
          {subtitle ? <div className="mt-1 text-xs leading-5 text-[var(--muted)]">{subtitle}</div> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      <div className={cn("px-3.5 py-3.5 sm:px-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function DaaSurfaceFilterChip({
  active,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 shrink-0 items-center rounded-[var(--radius-sm)] border px-3 text-xs font-semibold uppercase tracking-normal transition-colors",
        active
          ? "border-[var(--primary)]/38 bg-[var(--primary-bg)] text-[var(--primary)]"
          : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function DaaSurfaceStatusPill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: DaaSurfaceTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-normal",
        TONE_SURFACE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function DaaSurfaceNoticeBox({
  tone = "neutral",
  title,
  description,
  icon,
  action,
  className,
  children,
}: {
  tone?: DaaSurfaceTone;
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border px-3.5 py-3",
        TONE_SURFACE_CLASS[tone],
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {icon ? (
          <div className={cn("mt-0.5 shrink-0", TONE_TEXT_CLASS[tone])}>
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1 space-y-2">
          {title ? <div className={cn("text-sm font-semibold", TONE_TEXT_CLASS[tone])}>{title}</div> : null}
          {description ? <div className="text-sm leading-6 text-[var(--muted)]">{description}</div> : null}
          {children ? <div className="space-y-2 text-sm text-[var(--text)]">{children}</div> : null}
          {action ? <div className="pt-1">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function DaaSurfaceEmptyState({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] bg-[var(--card)] px-4 py-3 text-left",
        className,
      )}
    >
      <div className="max-w-2xl">
        <div className="text-sm font-semibold text-[var(--text)]">{title}</div>
        {description ? <div className="mt-1 text-xs leading-5 text-[var(--muted)]">{description}</div> : null}
        {action ? <div className="mt-3 flex flex-wrap items-center justify-start gap-2">{action}</div> : null}
      </div>
    </div>
  );
}

export const DaaSurfaceActionButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "neutral" | "success" | "warning" | "danger";
  children: ReactNode;
}>(function DaaSurfaceActionButton({
  children,
  tone = "neutral",
  className,
  ...props
}, ref) {
  const toneClasses = tone === "primary"
    ? "border-transparent bg-[var(--primary)] text-[var(--bg)] hover:opacity-90"
    : tone === "success"
      ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)] hover:border-[var(--success)]/45 hover:bg-[var(--success-bg)]"
      : tone === "warning"
        ? "border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber)] hover:border-[var(--amber)]/45 hover:bg-[var(--amber-bg)]"
        : tone === "danger"
          ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)] hover:border-[var(--danger)]/45 hover:bg-[var(--danger-bg)]"
          : "border-[var(--border-strong)] bg-[var(--card)] text-[var(--text)] hover:border-[var(--primary)]/35 hover:bg-[var(--hover)]";

  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-bg)] disabled:cursor-not-allowed disabled:opacity-60",
        toneClasses,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

export function DaaSurfaceDialogShell({
  accent = "primary",
  title,
  description,
  badges,
  footer,
  className,
  bodyClassName,
  children,
  ...props
}: Omit<ComponentPropsWithoutRef<typeof DialogContent>, "children"> & {
  accent?: DaaSurfaceTone;
  title: ReactNode;
  description?: ReactNode;
  badges?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <DialogContent
      {...props}
      className={cn(daaSurfaceDialogContentClassName, className)}
      data-accent={accent}
    >
      <div className="shrink-0 border-b border-[var(--border)] px-4 pb-3 pt-4 sm:px-5">
        {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
        <DialogTitle className="mt-3 text-[22px] font-semibold leading-none text-[var(--text)] sm:text-[24px]">
          {title}
        </DialogTitle>
        {description ? (
          <DialogDescription className="mt-2.5 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            {description}
          </DialogDescription>
        ) : null}
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5", bodyClassName)}>{children}</div>
      {footer ? <div className="shrink-0 border-t border-[var(--border)] px-4 py-3 sm:px-5">{footer}</div> : null}
    </DialogContent>
  );
}
