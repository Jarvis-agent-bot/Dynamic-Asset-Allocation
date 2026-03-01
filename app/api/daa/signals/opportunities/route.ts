import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { buildOpportunityPanelV1 } from "@/src/daa/signals/opportunityServiceV1";

export const runtime = "nodejs";

function parseCsvList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,;，]+/g)
    .map((x) => String(x || "").trim().toUpperCase())
    .filter(Boolean);
}

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const symbols = parseCsvList(url.searchParams.get("symbols"));
    const fundCodes = parseCsvList(url.searchParams.get("fundCodes")).map((x) => x.trim()).filter(Boolean);

    if (!symbols.length) {
      return failV1("VALIDATION_FAILED", "symbols is required", { status: 400 });
    }

    const panel = await buildOpportunityPanelV1({ symbols, fundCodes });
    return okV1({ panel });
  });
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<{ symbols?: unknown; fundCodes?: unknown }>(req);
    const symbols = Array.isArray(body?.symbols)
      ? body.symbols.map((x) => String(x || "").trim().toUpperCase()).filter(Boolean)
      : [];
    const fundCodes = Array.isArray(body?.fundCodes)
      ? body.fundCodes.map((x) => String(x || "").trim()).filter(Boolean)
      : [];

    if (!symbols.length) {
      return failV1("VALIDATION_FAILED", "symbols must be a non-empty array", { status: 400 });
    }

    const panel = await buildOpportunityPanelV1({ symbols, fundCodes });
    return okV1({ panel });
  });
}
