import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { executeRebalanceViaGateway } from "@/src/daa/modules/workbench/executionGateway";
import { WorkbenchDomainError } from "@/src/daa/modules/workbench/workbenchErrors";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

type Body = {
  cycleId?: unknown;
  executeMode?: unknown;
};

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<Body>(req);
    const payload = (body || {}) as Body;
    const cycleId = String(payload.cycleId || "").trim();
    if (!cycleId) {
      return fail("VALIDATION_FAILED", "cycleId is required", { status: 400 });
    }
    const executeMode = String(payload.executeMode || "").trim().toLowerCase() === "selected" ? "selected" : "all";
    let data;
    try {
      data = await executeRebalanceViaGateway({ cycleId, executeMode });
    } catch (error) {
      if (error instanceof WorkbenchDomainError) {
        return fail("VALIDATION_FAILED", error.message, {
          status: error.status,
          details: {
            code: error.code,
            ...(error.details || {}),
          },
        });
      }
      const message = error instanceof Error ? error.message : String(error || "");
      if (message.startsWith("RISK_BLOCKED:")) {
        const raw = message.slice("RISK_BLOCKED:".length).trim();
        let details: Record<string, unknown> = {
          code: "RISK_BLOCKED",
          rule: "unknown",
          current: null,
          limit: null,
        };
        let reason = "执行前风控阻断";
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          reason = String(parsed.message || reason);
          details = {
            code: String(parsed.code || "RISK_BLOCKED"),
            rule: String(parsed.rule || "unknown"),
            current: parsed.current ?? null,
            limit: parsed.limit ?? null,
          };
        } catch (err) {
  logSwallowed("rebalanceExecuteRoute.parseReason", err);
          reason = raw || reason;
        }
        return fail("VALIDATION_FAILED", reason, { status: 409, details });
      }
      throw error;
    }

    return ok(data);
  });
}
