import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import type { ApiErrorCode } from "@/src/daa/api/contracts";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { executeRebalanceViaGateway } from "@/src/daa/modules/workbench/executionGateway";
import { normalizeRebalanceExecuteMode } from "@/src/daa/modules/workbench/rebalanceExecuteMode";
import { WorkbenchDomainError } from "@/src/daa/modules/workbench/workbenchErrors";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

type Body = {
  cycleId?: unknown;
  executeMode?: unknown;
};

function isMarketExecutionErrorCode(code: unknown): code is Extract<ApiErrorCode, "MARKET_CLOSED" | "UNSUPPORTED_MARKET"> {
  return code === "MARKET_CLOSED" || code === "UNSUPPORTED_MARKET";
}

function mapEncodedMarketExecutionError(message: string): Response | null {
  if (!message.startsWith("MARKET_CLOSED:")) return null;
  const raw = message.slice("MARKET_CLOSED:".length).trim();
  let reason = "当前市场未开盘，暂不能执行下单。";
  let details: Record<string, unknown> = { code: "MARKET_CLOSED" };

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const code = isMarketExecutionErrorCode(parsed.code) ? parsed.code : "MARKET_CLOSED";
    reason = String(parsed.message || reason);
    details = {
      code,
      symbol: parsed.symbol ?? null,
      marketStatus: parsed.marketStatus ?? null,
    };
    return fail(code, reason, { status: 409, details });
  } catch (err) {
    logSwallowed("rebalanceExecuteRoute.parseMarketExecutionError", err);
    reason = raw || reason;
  }

  return fail("MARKET_CLOSED", reason, { status: 409, details });
}

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
    const executeMode = normalizeRebalanceExecuteMode(payload.executeMode);
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
      const marketExecutionError = mapEncodedMarketExecutionError(message);
      if (marketExecutionError) return marketExecutionError;
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
