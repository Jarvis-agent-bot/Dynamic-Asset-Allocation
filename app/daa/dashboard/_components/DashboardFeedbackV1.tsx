import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { DeepLedgerEmptyState, DeepLedgerNoticeBox } from "@/app/daa/dashboard/_components/DeepLedgerUI";

type DashboardFeedbackProps = {
  title?: string;
  description?: string;
  className?: string;
  action?: ReactNode;
};

export function DashboardErrorNoticeV1({
  title = "操作失败",
  description,
  className,
  action,
}: DashboardFeedbackProps) {
  if (!description) return null;
  return (
    <div role="alert" aria-live="assertive">
      <DeepLedgerNoticeBox
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

export function DashboardSuccessNoticeV1({
  title = "操作已完成",
  description,
  className,
  action,
}: DashboardFeedbackProps) {
  if (!description) return null;
  return (
    <div role="status" aria-live="polite">
      <DeepLedgerNoticeBox
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

export function DashboardEmptyStateV1({
  title = "暂无数据",
  description,
  className,
  action,
}: DashboardFeedbackProps) {
  return (
    <DeepLedgerEmptyState
      title={title}
      description={description}
      className={className}
      action={action}
    />
  );
}
