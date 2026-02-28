// Edge-safe constants for DAA auth.

export const DAA_AUTH_SESSION_COOKIE_V0 = "daa.auth.session.v0";

// Session cookie must cover `/daa/*` pages so middleware can enforce auth
// without causing login redirect loops.
export const DAA_AUTH_SESSION_COOKIE_PATH_V0 = "/";
