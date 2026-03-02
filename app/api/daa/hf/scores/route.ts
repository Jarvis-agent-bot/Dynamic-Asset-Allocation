import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponseV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { getLatestHumanSignalBatchV1 } from "@/src/daa/hf/hfServiceV1";

export const runtime = "nodejs";

function parseCsvList(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  const values = raw
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function parseBool(raw: string | null): boolean {
  const value = String(raw || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const marketScope = parseCsvList(url.searchParams.get("markets"));
    const symbols = parseCsvList(url.searchParams.get("symbols"));
    const fundCodes = parseCsvList(url.searchParams.get("fundCodes"));
    const forceRefresh = parseBool(url.searchParams.get("refresh"));

    const batch = await getLatestHumanSignalBatchV1({
      marketScope,
      symbols,
      fundCodes,
      forceRefresh,
      autoIngestOnMiss: false,
    });

    return okV1({ batch });
  });
}
