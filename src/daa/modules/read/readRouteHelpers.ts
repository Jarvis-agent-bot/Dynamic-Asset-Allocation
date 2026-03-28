import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok } from "@/src/daa/api/routeHelpers";

export function parseBooleanSearchParam(value: string | null, fallback = false): boolean {
  if (value == null) return fallback;
  const text = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
}

export function parseIntegerSearchParam(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

export async function buildViewerReadRouteResponse<T>(req: Request, input: {
  load: (searchParams: URLSearchParams) => Promise<T>;
  fallback: () => T;
}): Promise<Response> {
  const authResult = await requireDaaAdminViewerAuth(req);
  const denied = mapDeniedResponse(authResult);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  return ok(await input.load(searchParams));
}
