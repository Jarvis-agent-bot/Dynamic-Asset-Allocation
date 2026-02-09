/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  // The app routes already live under /daa (see app/daa/*).
  // Do NOT also set Next.js basePath to /daa, otherwise routes become /daa/daa/*.
  // VPS/Nginx should forward requests to the app without stripping the /daa prefix.

  // v0 milestone smoke checks hit explicit trailing slash URLs (e.g. /daa/step/4/).
  // Keep canonical routing as no-slash, but allow /path/ to resolve without a 308.
  trailingSlash: false,

  // Avoid auto-redirecting between /path and /path/ forms; in front of CF/Nginx,
  // redirects can be interpreted differently (and would fail the smoke check).
  skipTrailingSlashRedirect: true,
};

module.exports = nextConfig;
