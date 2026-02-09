/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  // The app routes already live under /daa (see app/daa/*).
  // Do NOT also set Next.js basePath to /daa, otherwise routes become /daa/daa/*.
  // VPS/Nginx should forward requests to the app without stripping the /daa prefix.

  // v0 milestone smoke checks hit explicit trailing slash URLs (e.g. /daa/step/4/).
  // Make trailing-slash URLs first-class to ensure they return 200 (no 308).
  trailingSlash: true,
};

module.exports = nextConfig;
