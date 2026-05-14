import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { buildTechnicalSignalForSymbol } from "@/src/daa/signals/technicalSignal";

export const runtime = "nodejs";

function normalizeSymbols(value: string | null): string[] {
  const out = new Set<string>();
  for (const item of String(value || "").split(",")) {
    const symbol = item.trim();
    if (symbol) out.add(symbol);
  }
  return [...out].slice(0, 40);
}

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const symbols = normalizeSymbols(url.searchParams.get("symbols"));
    if (symbols.length > 0) {
      const results = await Promise.allSettled(
        symbols.map(async (symbol) => ({
          symbol,
          signal: await buildTechnicalSignalForSymbol(symbol),
        })),
      );
      const items: Record<string, Awaited<ReturnType<typeof buildTechnicalSignalForSymbol>>> = {};
      const unavailableReasons: Record<string, string | null> = {};
      for (let i = 0; i < symbols.length; i += 1) {
        const symbol = symbols[i];
        const result = results[i];
        if (!symbol) continue;
        const key = symbol.toUpperCase();
        if (result?.status === "fulfilled") {
          items[key] = result.value.signal;
          unavailableReasons[key] = result.value.signal ? null : "not_enough_price_history";
        } else {
          items[key] = null;
          unavailableReasons[key] = "signal_failed";
        }
      }
      return ok({ items, unavailableReasons });
    }

    const symbol = String(url.searchParams.get("symbol") || "").trim();
    if (!symbol) {
      return fail("VALIDATION_FAILED", "missing symbol", { status: 400 });
    }

    const signal = await buildTechnicalSignalForSymbol(symbol);
    return ok({
      symbol,
      signal,
      unavailableReason: signal ? null : "not_enough_price_history",
    });
  });
}
