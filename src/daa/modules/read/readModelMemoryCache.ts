type CacheEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

const cache = new Map<string, CacheEntry<unknown>>();
const MAX_CACHE_ENTRIES = 64;

function pruneExpired(now: number) {
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

export async function getOrSetReadModelMemoryCache<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  pruneExpired(now);

  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > now) {
    return existing.value;
  }

  const value = Promise.resolve().then(load);
  cache.set(key, {
    expiresAt: now + Math.max(1, ttlMs),
    value,
  });

  try {
    return await value;
  } catch (err) {
    const current = cache.get(key);
    if (current?.value === value) cache.delete(key);
    throw err;
  }
}

export function clearReadModelMemoryCache() {
  cache.clear();
}
