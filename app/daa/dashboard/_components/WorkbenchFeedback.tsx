import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { DaaSurfaceEmptyState, DaaSurfaceNoticeBox } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { cn } from "@/lib/utils";

type WorkbenchFeedbackProps = {
  title?: string;
  description?: string;
  className?: string;
  action?: ReactNode;
};

export function WorkbenchErrorNotice({
  title = "操作失败",
  description,
  className,
  action,
}: WorkbenchFeedbackProps) {
  if (!description) return null;
  return (
    <div role="alert" aria-live="assertive">
      <DaaSurfaceNoticeBox
        tone="danger"
        title={title}
        description={description}
        icon={<AlertTriangle className="h-4 w-4" />}
        className={className}
        action={action}
      />
    </div>
  );
}

export function WorkbenchSuccessNotice({
  title = "操作已完成",
  description,
  className,
  action,
}: WorkbenchFeedbackProps) {
  if (!description) return null;
  return (
    <div role="status" aria-live="polite">
      <DaaSurfaceNoticeBox
        tone="success"
        title={title}
        description={description}
        icon={<CheckCircle2 className="h-4 w-4" />}
        className={className}
        action={action}
      />
    </div>
  );
}

export function WorkbenchEmptyState({
  title = "暂无数据",
  description,
  className,
  action,
}: WorkbenchFeedbackProps) {
  return (
    <DaaSurfaceEmptyState
      title={title}
      description={description}
      className={className}
      action={action}
    />
  );
}

export function WorkbenchLoadingState({
  title = "正在加载",
  description,
  className,
}: Omit<WorkbenchFeedbackProps, "action">) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 text-sm text-[var(--muted)]",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--primary)]" />
      <div className="min-w-0">
        <div className="font-medium text-[var(--text)]">{title}</div>
        {description ? <div className="mt-0.5 text-xs text-[var(--faint)]">{description}</div> : null}
      </div>
    </div>
  );
}
