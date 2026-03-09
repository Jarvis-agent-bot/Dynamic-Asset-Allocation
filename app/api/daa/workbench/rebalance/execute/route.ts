import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { WorkbenchDomainErrorV1, executeWorkbenchRebalanceCycleV1 } from "@/src/daa/modules/workbench/workbenchServiceV1";

export const runtime = "nodejs";

type Body = {
  cycleId?: unknown;
  executeMode?: unknown;
};

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<Body>(req);
    const payload = (body || {}) as Body;
    const cycleId = String(payload.cycleId || "").trim();
    if (!cycleId) {
      return failV1("VALIDATION_FAILED", "cycleId is required", { status: 400 });
    }
    const executeMode = String(payload.executeMode || "").trim().toLowerCase() === "selected" ? "selected" : "all";
    let data;
    try {
      data = await executeWorkbenchRebalanceCycleV1({ cycleId, executeMode });
    } catch (error) {
      if (error instanceof WorkbenchDomainErrorV1) {
        return failV1("VALIDATION_FAILED", error.message, {
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
        } catch {
          reason = raw || reason;
        }
        return failV1("VALIDATION_FAILED", reason, { status: 409, details });
      }
      throw error;
    }
    return okV1(data);
  });
}
