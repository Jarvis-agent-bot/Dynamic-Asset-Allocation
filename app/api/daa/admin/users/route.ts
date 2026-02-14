import { NextResponse } from "next/server";

import {
  getDaaAdminTokensConfiguredV0,
  inferDaaAdminRoleForTokenV0,
  inferDaaAdminTokenKindV0,
  requireDaaAdminViewerAuth,
  type DaaAdminRole,
} from "@/src/daa/adminAuth";

type AdminUserV0 = {
  id: "viewer-token" | "editor-token" | "legacy-token";
  role: DaaAdminRole;
  configured: boolean;
  source: "env";
};

function parseBearerToken(authHeader: string | null): string {
  const raw = typeof authHeader === "string" ? authHeader.trim() : "";
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return typeof m?.[1] === "string" ? m[1].trim() : "";
}

// Read-only diagnostics endpoint for the dashboard.
// It intentionally does NOT expose any token material.
export async function GET(req: Request) {
  const denied = requireDaaAdminViewerAuth(req);
  if (denied) return denied;

  const configured = getDaaAdminTokensConfiguredV0();

  const providedToken = parseBearerToken(req.headers.get("authorization"));
  const me = {
    tokenKind: inferDaaAdminTokenKindV0(providedToken),
    role: inferDaaAdminRoleForTokenV0(providedToken),
  };

  const users: AdminUserV0[] = [
    { id: "viewer-token", role: "viewer", configured: configured.viewer, source: "env" },
    { id: "editor-token", role: "editor", configured: configured.editor, source: "env" },
    // Legacy token historically grants editor-level access.
    { id: "legacy-token", role: "editor", configured: configured.legacy, source: "env" },
  ];

  return NextResponse.json({ ok: true, users, me });
}
