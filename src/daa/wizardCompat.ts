// Back-compat shim.
//
// Historically, middleware redirected `/daa/wizard*` to `/daa?step=...`.
// The canonical entry is now `/daa/dashboard`, and all legacy routes should
// redirect into it. Keep this export so older imports keep working.

export { getDaaDashboardCompatRedirect as getDaaWizardCompatRedirect } from "./dashboardCompat";
