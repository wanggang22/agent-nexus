/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  basePath: "/agent-nexus",
  images: { unoptimized: true },
};

module.exports = nextConfig;
