import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { getDaaAuthContextFromRequest } from "@/src/daa/auth/daaAuthRequest";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { getChatSessionByKey, listChatMessages, listRecentChatSessions } from "@/src/daa/chat/chatRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const auth = await getDaaAuthContextFromRequest(req);
    const sessionKey = auth ? `web:${auth.account.accountId}` : "";
    const currentSession = sessionKey ? await getChatSessionByKey(sessionKey) : null;
    const messages = currentSession ? await listChatMessages(currentSession.sessionId, 16) : [];
    const sessions = await listRecentChatSessions(8);
    return ok({
      session: currentSession,
      messages,
      sessions,
    });
  });
}
