import { appendPaperExecutionLog, type PaperExecutionLogEntryV0 } from "./executionLogStore";

export type ExecutionAdapterKindV0 = "paper" | "real";

export type RealExecutionConfigV0 = {
  provider: "okx";
  accountId: string;
  apiKey: string;
  apiSecret: string;
  apiPassphrase: string;
};

export type ExecuteOrdersArgsV0 = {
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined;
  source: PaperExecutionLogEntryV0["source"];
  runId?: string;
  orders: unknown;
  note?: string;
  at?: string;
  idempotencyKey?: string;
  realConfig?: Partial<RealExecutionConfigV0> | null;
};

export type StructuredExecutionErrorV0 = {
  code: "invalid_orders" | "missing_idempotency_key" | "config_invalid" | "transport_error";
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
};

export type RealExecutionReceiptV0 = {
  idempotencyKey: string;
  provider: RealExecutionConfigV0["provider"];
  accountId: string;
  acceptedAt: string;
  orderCount: number;
};

export type ExecuteOrdersResultV0 =
  | { ok: true; kind: "paper"; entry: PaperExecutionLogEntryV0 }
  | { ok: true; kind: "real"; receipt: RealExecutionReceiptV0 }
  | { ok: false; kind: ExecutionAdapterKindV0; error: string; errorDetail?: StructuredExecutionErrorV0 };

export type ExecutionAdapterV0 = {
  kind: ExecutionAdapterKindV0;
  executeOrders: (args: ExecuteOrdersArgsV0) => ExecuteOrdersResultV0;
};

type RealAdapterOptionsV0 = {
  now?: () => string;
};

const defaultNowIsoV0 = () => new Date().toISOString();

function nowIso() {
  return defaultNowIsoV0();
}

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v : null;
}

function makeErrorV0(kind: ExecutionAdapterKindV0, error: StructuredExecutionErrorV0): ExecuteOrdersResultV0 {
  return { ok: false, kind, error: error.message, errorDetail: error };
}

function normalizeOrdersForValidationV0(x: unknown): { symbol: string; side: "BUY" | "SELL"; notional: number }[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter(Boolean)
    .map((o: any) => {
      const symbol = String(o?.symbol ?? "").trim();
      const sideRaw = String(o?.side ?? "").trim();
      const side: "BUY" | "SELL" | null = sideRaw === "BUY" ? "BUY" : sideRaw === "SELL" ? "SELL" : null;
      const notional = Number(o?.notional ?? NaN);
      if (!symbol || !side || !Number.isFinite(notional)) return null;
      return { symbol, side, notional };
    })
    .filter((o): o is { symbol: string; side: "BUY" | "SELL"; notional: number } => !!o);
}

function validateRealConfigV0(configLike: Partial<RealExecutionConfigV0> | null | undefined):
  | { ok: true; config: RealExecutionConfigV0 }
  | { ok: false; error: StructuredExecutionErrorV0 } {
  const provider = configLike?.provider;
  const accountId = normalizeNonEmptyString(configLike?.accountId);
  const apiKey = normalizeNonEmptyString(configLike?.apiKey);
  const apiSecret = normalizeNonEmptyString(configLike?.apiSecret);
  const apiPassphrase = normalizeNonEmptyString(configLike?.apiPassphrase);

  const missing: string[] = [];
  if (provider !== "okx") missing.push("provider(okx)");
  if (!accountId) missing.push("accountId");
  if (!apiKey) missing.push("apiKey");
  if (!apiSecret) missing.push("apiSecret");
  if (!apiPassphrase) missing.push("apiPassphrase");

  if (missing.length > 0) {
    return {
      ok: false,
      error: {
        code: "config_invalid",
        message: `real execution config invalid: missing ${missing.join(", ")}`,
        retryable: false,
        details: { missing },
      },
    };
  }

  return {
    ok: true,
    config: {
      provider,
      accountId,
      apiKey,
      apiSecret,
      apiPassphrase,
    },
  };
}

export function makePaperExecutionAdapterV0(): ExecutionAdapterV0 {
  return {
    kind: "paper",
    executeOrders(args) {
      const r = appendPaperExecutionLog({
        storage: args.storage,
        source: args.source,
        runId: args.runId,
        orders: args.orders,
        note: args.note,
        at: args.at,
      });

      if (!r.ok) return { ok: false, kind: "paper", error: r.error };
      return { ok: true, kind: "paper", entry: r.entry };
    },
  };
}

export function makeRealExecutionAdapterV0(options?: RealAdapterOptionsV0): ExecutionAdapterV0 {
  const now = options?.now ?? nowIso;
  const idempotencyCache = new Map<string, RealExecutionReceiptV0>();

  return {
    kind: "real",
    executeOrders(args) {
      const idempotencyKey = normalizeNonEmptyString(args.idempotencyKey);
      if (!idempotencyKey) {
        return makeErrorV0("real", {
          code: "missing_idempotency_key",
          message: "real execution requires idempotencyKey",
          retryable: false,
        });
      }

      const cached = idempotencyCache.get(idempotencyKey);
      if (cached) return { ok: true, kind: "real", receipt: cached };

      const orders = normalizeOrdersForValidationV0(args.orders);
      if (orders.length === 0 && Array.isArray(args.orders) && (args.orders as unknown[]).length > 0) {
        return makeErrorV0("real", {
          code: "invalid_orders",
          message: "real execution requires valid orders",
          retryable: false,
        });
      }

      const configResult = validateRealConfigV0(args.realConfig);
      if (!configResult.ok) return makeErrorV0("real", configResult.error);

      try {
        const receipt: RealExecutionReceiptV0 = {
          idempotencyKey,
          provider: configResult.config.provider,
          accountId: configResult.config.accountId,
          acceptedAt: now(),
          orderCount: orders.length,
        };

        idempotencyCache.set(idempotencyKey, receipt);
        return { ok: true, kind: "real", receipt };
      } catch (e) {
        return makeErrorV0("real", {
          code: "transport_error",
          message: e instanceof Error ? e.message : String(e),
          retryable: true,
        });
      }
    },
  };
}

export function getExecutionAdapterV0(kind?: ExecutionAdapterKindV0 | null): ExecutionAdapterV0 {
  return kind === "real" ? makeRealExecutionAdapterV0() : makePaperExecutionAdapterV0();
}

export function getDefaultExecutionAdapterV0(): ExecutionAdapterV0 {
  return getExecutionAdapterV0("paper");
}
