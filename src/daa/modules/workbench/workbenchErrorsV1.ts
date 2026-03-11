export type WorkbenchDomainErrorCodeV1 =
  | "CYCLE_NOT_EXECUTABLE"
  | "CYCLE_IMMUTABLE"
  | "CYCLE_ALREADY_COMPLETED";

export class WorkbenchDomainErrorV1 extends Error {
  readonly code: WorkbenchDomainErrorCodeV1;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: WorkbenchDomainErrorCodeV1,
    message: string,
    options: {
      status?: number;
      details?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.name = "WorkbenchDomainErrorV1";
    this.code = code;
    this.status = options.status ?? 409;
    this.details = options.details ?? {};
  }
}
