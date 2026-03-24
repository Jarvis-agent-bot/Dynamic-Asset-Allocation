import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { getDaaAuthContextFromRequest } from "@/src/daa/auth/daaAuthRequest";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { loadWebAssistantConversationReadModel } from "@/src/daa/chat/chatConversationReadService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const auth = await getDaaAuthContextFromRequest(req);
    const sessionId = (url.searchParams.get("sessionId") || "").trim();
    const conversation = await loadWebAssistantConversationReadModel({
      accountId: auth?.account.accountId || "",
      username: auth?.account.username || "",
      sessionId: sessionId || null,
      messageLimit: 16,
      sessionLimit: 8,
    });
    return ok({
      session: conversation.selectedSession,
      messages: conversation.messages,
      sessions: conversation.sessions,
      threads: conversation.threads,
      conversation,
    });
  });
}
