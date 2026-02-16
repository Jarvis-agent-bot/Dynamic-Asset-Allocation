import { postEmailLoginLinkV0 } from "../_lib/emailLoginRequestHandlerV0";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return postEmailLoginLinkV0(req, { mode: "resend" });
}
