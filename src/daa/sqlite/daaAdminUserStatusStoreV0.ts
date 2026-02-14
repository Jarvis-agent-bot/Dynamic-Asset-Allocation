import { withDaaSqliteDbV0 } from "./daaSqliteDbV0";

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
  const userId = String(userIdRaw ?? "").trim();
  if (!userId) throw new Error("missing userId");

  return withDaaSqliteDbV0(async ({ db }) => {
    const stmt = db.prepare("SELECT status FROM daa_admin_user_status WHERE user_id = ?");
    try {
      stmt.bind([userId]);
      if (!stmt.step()) return "active";
      const row = stmt.getAsObject();
      return normalizeStatus((row as any).status);
    } finally {
      stmt.free();
    }
  });
}

export async function getDaaAdminUserStatusMapV0(userIdsRaw: string[]): Promise<Record<string, DaaAdminUserStatusV0>> {
  const userIds = Array.isArray(userIdsRaw) ? userIdsRaw.map((x) => String(x ?? "").trim()).filter(Boolean) : [];

  // Default: active for any missing row.
  const out: Record<string, DaaAdminUserStatusV0> = {};
  for (const id of userIds) out[id] = "active";
  if (!userIds.length) return out;

  return withDaaSqliteDbV0(async ({ db }) => {
    const inList = userIds.map(() => "?").join(",");
    const stmt = db.prepare(`SELECT user_id, status FROM daa_admin_user_status WHERE user_id IN (${inList})`);
    try {
      stmt.bind(userIds);
      while (stmt.step()) {
        const row = stmt.getAsObject();
        const id = String((row as any).user_id ?? "").trim();
        if (!id) continue;
        out[id] = normalizeStatus((row as any).status);
      }
      return out;
    } finally {
      stmt.free();
    }
  });
}

export async function setDaaAdminUserActiveV0(args: { userId: string; active: boolean; updatedAt?: string }) {
  const userId = String(args.userId ?? "").trim();
  if (!userId) throw new Error("missing userId");

  const active = Boolean(args.active);
  const updatedAt = typeof args.updatedAt === "string" && args.updatedAt.trim() ? args.updatedAt.trim() : nowIso();

  await withDaaSqliteDbV0(async ({ db, markDirty }) => {
    if (active) {
      const stmt = db.prepare("DELETE FROM daa_admin_user_status WHERE user_id = ?");
      try {
        stmt.run([userId]);
      } finally {
        stmt.free();
      }

      markDirty();
      return;
    }

    const stmt = db.prepare(
      "INSERT INTO daa_admin_user_status (user_id, status, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(user_id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at",
    );
    try {
      stmt.run([userId, "inactive", updatedAt]);
    } finally {
      stmt.free();
    }

    markDirty();
  });

  return { ok: true, userId, status: active ? "active" : "inactive", updatedAt };
}
