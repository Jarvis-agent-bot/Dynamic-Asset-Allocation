import { appendPaperExecutionLog, type PaperExecutionLogEntryV0 } from "./executionLogStore";

export type ExecutionAdapterKindV0 = "paper" | "real";

export type ExecuteOrdersArgsV0 = {
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined;
  source: PaperExecutionLogEntryV0["source"];
  orders: unknown;
  note?: string;
  at?: string;
};

export type ExecuteOrdersResultV0 =
  | { ok: true; kind: "paper"; entry: PaperExecutionLogEntryV0 }
  | { ok: false; kind: ExecutionAdapterKindV0; error: string };

export type ExecutionAdapterV0 = {
  kind: ExecutionAdapterKindV0;
  executeOrders: (args: ExecuteOrdersArgsV0) => ExecuteOrdersResultV0;
};

export function makePaperExecutionAdapterV0(): ExecutionAdapterV0 {
  return {
    kind: "paper",
    executeOrders(args) {
      const r = appendPaperExecutionLog({
        storage: args.storage,
        source: args.source,
        orders: args.orders,
        note: args.note,
        at: args.at,
      });

      if (!r.ok) return { ok: false, kind: "paper", error: r.error };
      return { ok: true, kind: "paper", entry: r.entry };
    },
  };
}

export function makeRealExecutionAdapterV0(): ExecutionAdapterV0 {
  // v0 placeholder: keep API stable; implementation will be wired when we add broker integrations.
  return {
    kind: "real",
    executeOrders() {
      return { ok: false, kind: "real", error: "real execution adapter is not configured" };
    },
  };
}

export function getExecutionAdapterV0(kind?: ExecutionAdapterKindV0 | null): ExecutionAdapterV0 {
  return kind === "real" ? makeRealExecutionAdapterV0() : makePaperExecutionAdapterV0();
}

export function getDefaultExecutionAdapterV0(): ExecutionAdapterV0 {
  // Paper is the safe default.
  return getExecutionAdapterV0("paper");
}
