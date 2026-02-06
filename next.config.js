/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_BASE_PATH || "";

const nextConfig = {
  reactStrictMode: true,
  // For VPS nginx path-based hosting, e.g. /daa
  basePath,
  assetPrefix: basePath || undefined,
};

module.exports = nextConfig;
