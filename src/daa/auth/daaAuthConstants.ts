// Edge-safe constants for DAA auth.
// Use a new cookie name to invalidate older scoped tokens safely.
export const DAA_AUTH_SESSION_COOKIE_ = "daa.auth.session.v1";

// Session cookie must cover `/daa/*` pages so middleware can enforce auth
// without causing login redirect loops.
export const DAA_AUTH_SESSION_COOKIE_PATH_ = "/";
