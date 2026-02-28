/** @type {import('next').NextConfig} */

const distDir = (process.env.NEXT_DIST_DIR || "").trim();

const nextConfig = {
  reactStrictMode: true,
  // The app routes already live under /daa (see app/daa/*).
  // Do NOT also set Next.js basePath to /daa, otherwise routes become /daa/daa/*.
  // VPS/Nginx should forward requests to the app without stripping the /daa prefix.

  // v0 milestone smoke checks hit explicit trailing-slash URLs (e.g. /daa/step/4/).
  // v0 milestone smoke checks hit explicit trailing-slash URLs (e.g. /daa/step/4/).
  // On the VPS/Cloudflare stack, the non-slash form may be treated as canonical.
  // We keep Next's default and disable the built-in trailing-slash redirect so
  // both `/foo` and `/foo/` render 200.
  trailingSlash: false,
  skipTrailingSlashRedirect: true,
};

if (distDir) {
  nextConfig.distDir = distDir;
}

module.exports = nextConfig;
