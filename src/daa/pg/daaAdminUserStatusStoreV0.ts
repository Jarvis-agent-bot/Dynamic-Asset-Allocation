import { withDaaPgClientV0 } from "./daaPgV0";

import { ensureDaaStoreSchemaPgV0 } from "./daaStorePgV0";

export type DaaAdminUserIdV0 = "viewer-token" | "editor-token" | "legacy-token";

export type DaaAdminUserStatusV0 = "active" | "inactive";

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeStatus(raw: unknown): DaaAdminUserStatusV0 {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "inactive") return "inactive";
  return "active";
}

export async function getDaaAdminUserStatusV0(userIdRaw: string): Promise<DaaAdminUserStatusV0> {
  await ensureDaaStoreSchemaPgV0();

  const userId = String(userIdRaw ?? "").trim();
  if (!userId) throw new Error("missing userId");

  return withDaaPgClientV0(async ({ query }) => {
    const res = await query("SELECT status FROM daa_admin_user_status WHERE user_id = $1", [userId]);
    const row = res.rows?.[0] as any;
    if (!row) return "active";
    return normalizeStatus(row.status);
  });
}

export async function getDaaAdminUserStatusMapV0(userIdsRaw: string[]): Promise<Record<string, DaaAdminUserStatusV0>> {
  await ensureDaaStoreSchemaPgV0();

  const userIds = Array.isArray(userIdsRaw) ? userIdsRaw.map((x) => String(x ?? "").trim()).filter(Boolean) : [];

  const out: Record<string, DaaAdminUserStatusV0> = {};
  for (const id of userIds) out[id] = "active";
  if (!userIds.length) return out;

  return withDaaPgClientV0(async ({ query }) => {
    const placeholders = userIds.map((_, i) => `$${i + 1}`).join(",");
    const res = await query(`SELECT user_id, status FROM daa_admin_user_status WHERE user_id IN (${placeholders})`, userIds);
    for (const row of res.rows || []) {
      const id = String((row as any).user_id ?? "").trim();
      if (!id) continue;
      out[id] = normalizeStatus((row as any).status);
    }
    return out;
  });
}

export async function setDaaAdminUserActiveV0(args: { userId: string; active: boolean; updatedAt?: string }) {
  await ensureDaaStoreSchemaPgV0();

  const userId = String(args.userId ?? "").trim();
  if (!userId) throw new Error("missing userId");

  const active = Boolean(args.active);
  const updatedAt = typeof args.updatedAt === "string" && args.updatedAt.trim() ? args.updatedAt.trim() : nowIso();

  await withDaaPgClientV0(async ({ query }) => {
    if (active) {
      await query("DELETE FROM daa_admin_user_status WHERE user_id = $1", [userId]);
      return;
    }

    await query(
      "INSERT INTO daa_admin_user_status (user_id, status, updated_at) VALUES ($1, $2, $3) " +
        "ON CONFLICT(user_id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at",
      [userId, "inactive", updatedAt],
    );
  });

  return { ok: true, userId, status: active ? "active" : "inactive", updatedAt };
}
