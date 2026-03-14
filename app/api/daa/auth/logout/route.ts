import { createSupabaseServerClient } from "@/src/daa/supabase/server";
import { ok } from "@/src/daa/api/routeHelpers";

export const runtime = "nodejs";

export async function POST(_req: Request) {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut().catch(() => null);

  return ok({ signedOut: true });
}
