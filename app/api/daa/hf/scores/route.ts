import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { getLatestHumanSignalBatch } from "@/src/daa/hf/hfService";

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
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const marketScope = parseCsvList(url.searchParams.get("markets"));
    const symbols = parseCsvList(url.searchParams.get("symbols"));
    const fundCodes = parseCsvList(url.searchParams.get("fundCodes"));
    const forceRefresh = parseBool(url.searchParams.get("refresh"));

    const batch = await getLatestHumanSignalBatch({
      marketScope,
      symbols,
      fundCodes,
      forceRefresh,
      autoIngestOnMiss: false,
    });

    return ok({ batch });
  });
}
