// Edge-safe constants for DAA auth.

export const DAA_AUTH_SESSION_COOKIE_V0 = "daa.auth.session.v0";

// Scope the session cookie to Next.js API routes only (and not the entire site).
// This keeps the cookie off unrelated requests (assets, non-DAA pages) and
// matches the "Next.js /api/daa/* only" contract.
export const DAA_AUTH_SESSION_COOKIE_PATH_V0 = "/api/daa";
