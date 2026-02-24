export type DaaRunRowV0 = {
  runId: string;
  createdAt: string;
  kind: string;
  status: string;
  payload: unknown;
};

export type DaaRunAuditEventV0 = {
  eventId: string;
  runId: string;
  createdAt: string;
  kind: string;
  actorUserId: string;
  payload: unknown;
};

export type DaaRunBundleV0 = {
  run: DaaRunRowV0;
  portfolio: { createdAt: string; payload: unknown } | null;
  confirm: { createdAt: string; payload: unknown } | null;
  executed: { createdAt: string; payload: unknown } | null;
  audit: DaaRunAuditEventV0[];
};

export type DaaRunListRowV0 = {
  runId: string;
  createdAt: string;
  kind: string;
  status: string;
  source: string;
  actor: string;
  hasPortfolio: boolean;
  hasConfirm: boolean;
  hasExecuted: boolean;
  auditCount: number;
};

export type DaaRunAuditEventListRowV0 = {
  eventId: string;
  runId: string;
  createdAt: string;
  kind: string;
  actorUserId: string;
  payload: unknown;
};

export type DaaExecutionStatusValueV0 = "submitted" | "filled" | "failed";

export type DaaRunExecutionStatusRowV0 = {
  runId: string;
  orderId: string;
  status: DaaExecutionStatusValueV0;
  reason: string;
  code: string;
  updatedAt: string;
};
