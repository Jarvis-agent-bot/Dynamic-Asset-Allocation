/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  // The app routes already live under /daa (see app/daa/*).
  // Do NOT also set Next.js basePath to /daa, otherwise routes become /daa/daa/*.
  // VPS/Nginx should forward requests to the app without stripping the /daa prefix.

  // v0 milestone smoke checks hit explicit trailing slash URLs (e.g. /daa/step/4/).
  // Keep Next's canonical routing as no-slash, and use middleware rewrites to serve
  // both forms without a 308.
  trailingSlash: false,
  skipTrailingSlashRedirect: true,
  // Prevent Next's URL normalization from running before middleware (can cause 308s
  // that the middleware can't intercept).
  skipMiddlewareUrlNormalize: true,
};

module.exports = nextConfig;
