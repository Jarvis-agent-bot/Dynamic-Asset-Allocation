/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  // The app routes already live under /daa (see app/daa/*).
  // Do NOT also set Next.js basePath to /daa, otherwise routes become /daa/daa/*.
  // VPS/Nginx should forward requests to the app without stripping the /daa prefix.

  // v0 milestone smoke checks hit explicit trailing-slash URLs (e.g. /daa/step/4/).
  // Some Next.js deployments (or upstream proxies) normalize trailing slashes via redirects.
  // Disable Next's automatic trailing-slash redirects and rely on middleware.ts rewrite so
  // `/daa/step/4/` and `/daa/step/5/` serve 200 without a 308 hop.
  trailingSlash: false,
  skipTrailingSlashRedirect: true,
};

module.exports = nextConfig;
