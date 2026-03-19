import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { getDaaAuthContextFromRequest } from "@/src/daa/auth/daaAuthRequest";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { getChatSessionByKey, listChatMessages, listRecentChatSessions } from "@/src/daa/chat/chatRepo";
import { runAssistantTurn } from "@/src/daa/chat/chatOrchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  text?: unknown;
};

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<Body>(req);
    const text = String(body?.text || "").trim();
    if (!text) {
      return fail("VALIDATION_FAILED", "text is required", { status: 400 });
    }

    const auth = await getDaaAuthContextFromRequest(req);
    if (!auth) {
      return fail("UNAUTHORIZED", "auth required", { status: 401 });
    }

    const sessionKey = `web:${auth.account.accountId}`;
    const result = await runAssistantTurn({
      channel: "web",
      sessionKey,
      userText: text,
      title: `Web 助手 · ${auth.account.username}`,
      participantId: auth.account.username,
      externalUserId: auth.account.accountId,
      allowExecution: true,
    });
    const session = await getChatSessionByKey(sessionKey);
    const messages = session ? await listChatMessages(session.sessionId, 16) : [];
    const sessions = await listRecentChatSessions(8);

    return ok({
      session,
      messages,
      sessions,
      reply: {
        intentKind: result.intentKind,
        text: result.assistantText,
      },
    });
  });
}
