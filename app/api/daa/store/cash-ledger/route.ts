import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { appendDaaCashLedgerEntryV1, listDaaCashLedgerEntriesV1 } from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

function toLimit(value: string | null): number {
  const parsed = Number(value || 100);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(1, Math.min(1000, Math.trunc(parsed)));
}

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const entries = await listDaaCashLedgerEntriesV1(toLimit(url.searchParams.get("limit")));
    return okV1({ entries });
  });
}

type CashLedgerBodyV1 = {
  side?: unknown;
  amount?: unknown;
  baseCurrency?: unknown;
  note?: unknown;
};

const SUPPORTED_CASH_CURRENCIES = new Set(["USD", "RMB", "HKD"]);

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<CashLedgerBodyV1>(req);
    const side = String(body?.side || "").trim().toLowerCase();
    const amount = Number(body?.amount || 0);

    if (side !== "deposit" && side !== "withdraw") {
      return failV1("VALIDATION_FAILED", "side must be deposit or withdraw", { status: 400 });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return failV1("VALIDATION_FAILED", "amount must be a positive number", { status: 400 });
    }

    const baseCurrency = String(body?.baseCurrency || "USD").trim().toUpperCase() || "USD";
    if (!SUPPORTED_CASH_CURRENCIES.has(baseCurrency)) {
      return failV1("VALIDATION_FAILED", "baseCurrency must be one of USD/RMB/HKD", { status: 400 });
    }

    const result = await appendDaaCashLedgerEntryV1({
      side,
      amount,
      baseCurrency,
      note: String(body?.note || "").trim() || undefined,
    });

    return okV1(result);
  });
}
