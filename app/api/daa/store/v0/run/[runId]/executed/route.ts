import { NextResponse } from "next/server";

import { getDaaAdminActorUserIdFromRequestV1, requireDaaAdminEditorAuth } from "../../../../../../../../src/daa/adminAuth";
import { setDaaRunExecutedV0, setDaaRunExecutionStatusesV0 } from "../../../../../../../../src/daa/storeV0";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: { runId: string } }) {
  const denied = await requireDaaAdminEditorAuth(req);
  if (denied) return denied;

  const runId = String(ctx?.params?.runId ?? "").trim();
  if (!runId) return NextResponse.json({ ok: false, error: "missing runId" }, { status: 400 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  try {
    const actorUserId = await getDaaAdminActorUserIdFromRequestV1(req);
    const payload = (body as any).payload ?? body;
    await setDaaRunExecutedV0({ runId, payload, actorUserId });

    const orders = Array.isArray((payload as any)?.orders) ? (payload as any).orders : [];
    const statuses = orders
      .map((o: any, idx: number) => {
        const status = String(o?.status ?? "").trim().toLowerCase();
        if (status !== "submitted" && status !== "filled" && status !== "failed") return null;
        return {
          orderId: String(o?.id ?? o?.orderId ?? idx + 1),
          status,
          reason: String(o?.reason ?? o?.detail ?? "").trim(),
          code: String(o?.code ?? "").trim(),
        };
      })
      .filter((x): x is { orderId: string; status: "submitted" | "filled" | "failed"; reason: string; code: string } => !!x);

    if (statuses.length) {
      await setDaaRunExecutionStatusesV0({ runId, statuses, actorUserId });
    }

    return NextResponse.json({ ok: true, statusesSaved: statuses.length });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "error");
    const status = msg === "run not found" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
