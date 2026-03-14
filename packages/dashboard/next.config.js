const { config } = require("dotenv");
const path = require("path");

// Load .env from monorepo root
config({ path: path.resolve(__dirname, "../../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  env: {
    TWITTER_APP_KEY: process.env.TWITTER_APP_KEY,
    TWITTER_APP_SECRET: process.env.TWITTER_APP_SECRET,
    TWITTER_CLIENT_ID: process.env.TWITTER_CLIENT_ID,
    TWITTER_CLIENT_SECRET: process.env.TWITTER_CLIENT_SECRET,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXT_PUBLIC_GATEWAY_URL: process.env.NEXT_PUBLIC_GATEWAY_URL || process.env.GATEWAY_URL || "http://localhost:4000",
  },
};

module.exports = nextConfig;
