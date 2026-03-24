import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { DaaSurfaceEmptyState, DaaSurfaceNoticeBox } from "@/app/daa/dashboard/_components/DaaSurfaceUI";

type DashboardFeedbackProps = {
  title?: string;
  description?: string;
  className?: string;
  action?: ReactNode;
};

export function DashboardErrorNotice({
  title = "操作失败",
  description,
  className,
  action,
}: DashboardFeedbackProps) {
  if (!description) return null;
  return (
    <div role="alert" aria-live="assertive">
      <DaaSurfaceNoticeBox
        tone="red"
        title={title}
        description={description}
        icon={<AlertTriangle className="h-4 w-4" />}
        className={className}
        action={action}
      />
    </div>
  );
}

export function DashboardSuccessNotice({
  title = "操作已完成",
  description,
  className,
  action,
}: DashboardFeedbackProps) {
  if (!description) return null;
  return (
    <div role="status" aria-live="polite">
      <DaaSurfaceNoticeBox
        tone="green"
        title={title}
        description={description}
        icon={<CheckCircle2 className="h-4 w-4" />}
        className={className}
        action={action}
      />
    </div>
  );
}

export function DashboardEmptyState({
  title = "暂无数据",
  description,
  className,
  action,
}: DashboardFeedbackProps) {
  return (
    <DaaSurfaceEmptyState
      title={title}
      description={description}
      className={className}
      action={action}
    />
  );
}
