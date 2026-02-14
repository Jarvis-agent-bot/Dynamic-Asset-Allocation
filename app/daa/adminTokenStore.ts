'use client';

export const LS_DAA_ADMIN_TOKEN_V0 = 'daa.adminToken.v0';

export function loadDaaAdminTokenV0(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(LS_DAA_ADMIN_TOKEN_V0);
  const t = typeof raw === 'string' ? raw.trim() : '';
  return t ? t : null;
}

export function buildDaaAdminAuthHeadersV0(): Record<string, string> {
  const t = loadDaaAdminTokenV0();
  return t ? { authorization: `Bearer ${t}` } : {};
}
