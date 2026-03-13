export type WorkbenchDomainErrorCode =
  | "CYCLE_NOT_EXECUTABLE"
  | "CYCLE_IMMUTABLE"
  | "CYCLE_ALREADY_COMPLETED";

export class WorkbenchDomainError extends Error {
  readonly code: WorkbenchDomainErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: WorkbenchDomainErrorCode,
    message: string,
    options: {
      status?: number;
      details?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.name = "WorkbenchDomainError";
    this.code = code;
    this.status = options.status ?? 409;
    this.details = options.details ?? {};
  }
}
