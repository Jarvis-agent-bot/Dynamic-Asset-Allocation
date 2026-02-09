/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  // The app routes already live under /daa (see app/daa/*).
  // Do NOT also set Next.js basePath to /daa, otherwise routes become /daa/daa/*.
  // VPS/Nginx should forward requests to the app without stripping the /daa prefix.
  // v0 milestone smoke checks expect explicit trailing slash URLs to return 200.
  trailingSlash: true,
  // Avoid 308 redirects between /path and /path/; accept both (smoke checks hit /.../).
  skipTrailingSlashRedirect: true,
};

module.exports = nextConfig;
