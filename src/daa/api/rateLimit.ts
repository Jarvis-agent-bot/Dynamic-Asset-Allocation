/** 简易 IP 速率限制 */
const rateLimitMaps = new Map<string, Map<string, { count: number; resetAt: number }>>();

const MAX_MAP_SIZE = 10_000;

export function checkRateLimit(scope: string, req: Request, opts?: { windowMs?: number; max?: number }): boolean {
  const windowMs = opts?.windowMs ?? 60_000;
  const max = opts?.max ?? 3;
  if (!rateLimitMaps.has(scope)) rateLimitMaps.set(scope, new Map());
  const map = rateLimitMaps.get(scope)!;

  // 防止内存无限增长：超过阈值时清理过期条目
  if (map.size > MAX_MAP_SIZE) {
    const now = Date.now();
    for (const [key, entry] of map) {
      if (now > entry.resetAt) map.delete(key);
    }
  }

  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  const now = Date.now();
  const entry = map.get(ip);
  if (!entry || now > entry.resetAt) {
    map.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= max;
}

/** @internal 仅用于测试 */
export function _resetRateLimit(scope: string) {
  rateLimitMaps.get(scope)?.clear();
}
