import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { appendDaaCashLedgerEntry, listDaaCashLedgerEntries } from "@/src/daa/store/daaStorePg";

export const runtime = "nodejs";

function toLimit(value: string | null): number {
  const parsed = Number(value || 100);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(1, Math.min(1000, Math.trunc(parsed)));
}

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const entries = await listDaaCashLedgerEntries(toLimit(url.searchParams.get("limit")));
    return ok({ entries });
  });
}

type CashLedgerBody = {
  side?: unknown;
  amount?: unknown;
  baseCurrency?: unknown;
  note?: unknown;
};

const SUPPORTED_CASH_CURRENCIES = new Set(["USD", "CNY", "HKD", "EUR", "USDC"]);

function normalizeBaseCurrency(value: unknown): string {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "RMB" || raw === "CNH") return "CNY";
  return raw || "USD";
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<CashLedgerBody>(req);
    const side = String(body?.side || "").trim().toLowerCase();
    const amount = Number(body?.amount || 0);

    if (side !== "deposit" && side !== "withdraw") {
      return fail("VALIDATION_FAILED", "side must be deposit or withdraw", { status: 400 });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return fail("VALIDATION_FAILED", "amount must be a positive number", { status: 400 });
    }

    const baseCurrency = normalizeBaseCurrency(body?.baseCurrency);
    if (!SUPPORTED_CASH_CURRENCIES.has(baseCurrency)) {
      return fail("VALIDATION_FAILED", "baseCurrency must be one of USD/CNY/HKD/EUR/USDC", { status: 400 });
    }

    const result = await appendDaaCashLedgerEntry({
      side,
      amount,
      baseCurrency,
      note: String(body?.note || "").trim() || undefined,
    });

    return ok(result);
  });
}
