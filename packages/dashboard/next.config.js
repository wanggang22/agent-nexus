/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No more static export — need server-side for OAuth
  images: { unoptimized: true },
};

module.exports = nextConfig;
