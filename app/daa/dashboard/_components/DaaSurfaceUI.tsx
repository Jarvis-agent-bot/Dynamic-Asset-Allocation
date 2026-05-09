import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ComponentPropsWithoutRef, ReactNode } from "react";

import { DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const ACCENT_CLASS: Record<DaaSurfaceTone, string> = {
  cyan: "var(--primary)",
  amber: "var(--amber)",
  green: "var(--success)",
  red: "var(--danger)",
  indigo: "var(--indigo)",
  slate: "var(--muted)",
};

const TONE_STYLE: Record<DaaSurfaceTone, { border: string; bg: string; text: string }> = {
  cyan: {
    border: "var(--primary-border)",
    bg: "var(--primary-bg)",
    text: "var(--primary)",
  },
  amber: {
    border: "var(--amber-border)",
    bg: "var(--amber-bg)",
    text: "var(--amber)",
  },
  green: {
    border: "var(--success-border)",
    bg: "var(--success-bg)",
    text: "var(--success)",
  },
  red: {
    border: "var(--danger-border)",
    bg: "var(--danger-bg)",
    text: "var(--danger)",
  },
  indigo: {
    border: "var(--indigo-border)",
    bg: "var(--indigo-bg)",
    text: "var(--indigo)",
  },
  slate: {
    border: "var(--muted-border)",
    bg: "var(--muted-bg)",
    text: "var(--muted)",
  },
};

export type DaaSurfaceTone = "cyan" | "amber" | "green" | "red" | "indigo" | "slate";

export const daaSurfaceFieldClassName =
  "w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[rgba(8,12,20,0.78)] px-3.5 py-2.5 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--faint)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[rgba(56,189,248,0.16)]";

export const daaSurfaceDenseFieldClassName =
  "h-9 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[rgba(8,12,20,0.82)] px-3 text-xs text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--faint)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[rgba(56,189,248,0.14)]";

export const daaSurfaceSubtlePanelClassName =
  "rounded-[var(--radius-lg)] border border-[var(--border)] bg-[rgba(8,12,20,0.72)] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]";

export const daaSurfaceMonoPanelClassName =
  "rounded-[var(--radius-md)] border border-[var(--border)] bg-[rgba(8,12,20,0.58)] px-4 py-3 font-[var(--font-mono)] text-xs leading-6 text-[var(--muted)]";

export const daaSurfaceTableHeadClassName =
  "border-b border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]";

export const daaSurfaceTableCellClassName =
  "border-b border-[var(--border)]/70 px-4 py-3 align-top text-sm";

const daaSurfaceDialogContentClassName =
  "flex max-h-[min(90dvh,860px)] w-[calc(100vw-1rem)] max-w-[720px] flex-col overflow-hidden border-[var(--border)] bg-[linear-gradient(180deg,rgba(17,24,39,0.98),rgba(8,12,20,1))] p-0 text-[var(--text)] shadow-[0_28px_72px_rgba(0,0,0,0.48)] sm:w-[calc(100vw-2rem)]";

function toneColor(tone: DaaSurfaceTone = "cyan") {
  return ACCENT_CLASS[tone];
}

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
    <div className={cn("flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between", className)}>
      <div className="space-y-3">
        {eyebrow ? (
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
            <span className="h-px w-8 bg-[var(--primary)]/60" />
            <span>{eyebrow}</span>
          </div>
        ) : null}
        <div>
          <h1 className="font-[var(--font-display)] text-[30px] leading-none tracking-[-0.03em] text-[var(--text)] sm:text-[34px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)] sm:text-[15px]">
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
  accent = "cyan",
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
        "group relative overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(24,34,54,0.98),rgba(13,19,32,0.96))] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.28)] transition-transform duration-200 hover:-translate-y-0.5",
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: toneColor(accent) }} />
      <div className="absolute -right-8 top-2 h-24 w-24 rounded-full bg-[var(--primary)]/8 blur-3xl transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">{label}</div>
        <div className="mt-4 font-[var(--font-mono)] text-[28px] leading-none tracking-[-0.03em] text-[var(--text)] sm:text-[30px]">
          {value}
        </div>
        {subLabel ? <div className="mt-2 text-xs text-[var(--muted)]">{subLabel}</div> : null}
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
    </div>
  );
}

export function DaaSurfacePanel({
  title,
  subtitle,
  accent = "cyan",
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
        "relative overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(24,34,54,0.96),rgba(13,19,32,0.98))] shadow-[0_24px_50px_rgba(0,0,0,0.3)]",
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: toneColor(accent) }} />
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4 sm:px-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full" style={{ background: toneColor(accent) }} />
            <h2 className="text-[15px] font-semibold text-[var(--text)]">{title}</h2>
          </div>
          {subtitle ? <div className="mt-1 text-xs leading-5 text-[var(--muted)]">{subtitle}</div> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      <div className={cn("px-5 py-5 sm:px-6", bodyClassName)}>{children}</div>
    </section>
  );
}

export function DaaSurfaceMiniStat({
  label,
  value,
  hint,
  tone = "slate",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: DaaSurfaceTone;
  className?: string;
}) {
  const toneStyle = TONE_STYLE[tone];
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border bg-[rgba(8,12,20,0.74)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]",
        className,
      )}
      style={{ borderColor: toneStyle.border }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">{label}</div>
      <div className="mt-2 font-[var(--font-mono)] text-[24px] text-[var(--text)]">{value}</div>
      {hint ? <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div> : null}
    </div>
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
        "inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-semibold uppercase tracking-[0.08em] transition-colors",
        active
          ? "border-[var(--primary)]/38 bg-[rgba(56,189,248,0.12)] text-[var(--primary)]"
          : "border-[var(--border)] bg-[rgba(255,255,255,0.02)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function DaaSurfaceStatusPill({
  tone = "slate",
  children,
  className,
}: {
  tone?: DaaSurfaceTone;
  children: ReactNode;
  className?: string;
}) {
  const toneStyle = TONE_STYLE[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]",
        className,
      )}
      style={{
        borderColor: toneStyle.border,
        background: toneStyle.bg,
        color: toneStyle.text,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: toneStyle.text }} />
      {children}
    </span>
  );
}

export function DaaSurfaceNoticeBox({
  tone = "slate",
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
  const toneStyle = TONE_STYLE[tone];
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]",
        className,
      )}
      style={{
        borderColor: toneStyle.border,
        background: toneStyle.bg,
      }}
    >
      <div className="flex items-start gap-3">
        {icon ? (
          <div className="mt-0.5 shrink-0" style={{ color: toneStyle.text }}>
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1 space-y-2">
          {title ? <div className="text-sm font-semibold" style={{ color: toneStyle.text }}>{title}</div> : null}
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
        "rounded-[var(--radius-xl)] border border-dashed border-[var(--border-strong)] bg-[rgba(13,19,32,0.7)] px-5 py-10 text-center",
        className,
      )}
    >
      <div className="mx-auto max-w-md">
        <div className="text-sm font-semibold text-[var(--text)]">{title}</div>
        {description ? <div className="mt-2 text-sm leading-6 text-[var(--muted)]">{description}</div> : null}
        {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}

export const DaaSurfaceActionButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "slate" | "success" | "warning" | "danger";
  children: ReactNode;
}>(function DaaSurfaceActionButton({
  children,
  tone = "slate",
  className,
  ...props
}, ref) {
  const toneClasses = tone === "primary"
    ? "border-transparent bg-[var(--primary)] text-[var(--bg)] hover:opacity-90"
    : tone === "success"
      ? "border-emerald-400/22 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300/40 hover:bg-emerald-500/14"
      : tone === "warning"
        ? "border-amber-400/24 bg-amber-500/10 text-amber-200 hover:border-amber-300/42 hover:bg-amber-500/14"
        : tone === "danger"
          ? "border-rose-400/22 bg-rose-500/10 text-rose-200 hover:border-rose-300/42 hover:bg-rose-500/14"
          : "border-[var(--border-strong)] bg-[var(--elevated)] text-[var(--muted)] hover:border-[var(--primary)]/30 hover:text-[var(--text)]";

  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "inline-flex items-center gap-2 rounded-[var(--radius-sm)] border px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
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
  accent = "cyan",
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
    >
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${toneColor(accent)}, var(--amber), var(--indigo))` }} />
      <div className="shrink-0 border-b border-[var(--border)] px-5 pb-4 pt-5 sm:px-6">
        {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
        <DialogTitle className="mt-3.5 font-[var(--font-display)] text-[28px] leading-none tracking-[-0.03em] text-[var(--text)] sm:text-[30px]">
          {title}
        </DialogTitle>
        {description ? (
          <DialogDescription className="mt-2.5 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            {description}
          </DialogDescription>
        ) : null}
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6", bodyClassName)}>{children}</div>
      {footer ? <div className="shrink-0 border-t border-[var(--border)] px-5 py-3.5 sm:px-6">{footer}</div> : null}
    </DialogContent>
  );
}
