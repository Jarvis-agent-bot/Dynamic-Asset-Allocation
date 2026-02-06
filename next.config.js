/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  // The app routes already live under /daa (see app/daa/*).
  // Do NOT also set Next.js basePath to /daa, otherwise routes become /daa/daa/*.
  // VPS/Nginx should forward requests to the app without stripping the /daa prefix.
  // Must be false so /daa/step/2 returns HTTP 200 (no 308 redirect) on VPS health checks.
  trailingSlash: false,
};

module.exports = nextConfig;
