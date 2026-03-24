import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { getDaaAuthContextFromRequest } from "@/src/daa/auth/daaAuthRequest";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { buildWebAssistantSessionDescriptor } from "@/src/daa/chat/channelAdapters";
import { runAssistantTurn } from "@/src/daa/chat/chatOrchestrator";
import { loadWebAssistantConversationReadModel } from "@/src/daa/chat/chatConversationReadService";

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

    const descriptor = buildWebAssistantSessionDescriptor({
      accountId: auth.account.accountId,
      username: auth.account.username,
    });
    const result = await runAssistantTurn({
      ...descriptor,
      userText: text,
      allowExecution: true,
    });
    const conversation = await loadWebAssistantConversationReadModel({
      accountId: auth.account.accountId,
      username: auth.account.username,
      messageLimit: 16,
      sessionLimit: 8,
    });

    return ok({
      session: conversation.selectedSession,
      messages: conversation.messages,
      sessions: conversation.sessions,
      threads: conversation.threads,
      conversation,
      reply: {
        intentKind: result.intentKind,
        text: result.assistantText,
      },
    });
  });
}
